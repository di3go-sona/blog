---
title: Troubleshooting a Kubernetes cluster
published: 2026-08-02
type: article
series: Homelab
tags:
  - Homelab
  - Kubernetes
  - Troubleshooting
github:
  - https://github.com/di3go-sona/homelab
draft: true
---

**The day is August 2nd, 2026.**

I checked my phone and noticed my home dashboard was down. No Jellyfin, no Home Assistant, no Radarr. The cluster was gone.

Three Raspberry Pi nodes, one USB HDD, and an evening of recovery ahead.

Here's how it went, and what I learned about troubleshooting a Kubernetes cluster when everything goes wrong at once.

## The Setup

My homelab runs [k0s](https://k0sproject.io) on three Raspberry Pi 5 nodes (`192.168.8.13`, `.14`, `.15`), with a fourth x86 worker node (`.18`). Storage is provided by an NFS server running on `.13`, serving a USB HDD via the NFS CSI driver. Everything is managed through ArgoCD with GitOps, and the whole infrastructure is provisioned with Ansible.

It's a clean, tidy setup. Until it isn't.

## Step 1: Assess the Damage

The first thing to do when a cluster goes down is figure out *what* is actually broken. Don't start fixing things blindly.

```
ssh root@192.168.8.13  →  No route to host
ssh root@192.168.8.14  →  Permission denied (then: No route to host)
ssh root@192.168.8.15  →  Connected, but kubelet is inactive
```

Node `.13` (pi-delta) was completely dead — hardware failure. Node `.14` (pi-epsilon) had a corrupted SD card. Node `.15` (pi-gamma) was alive but the Kubernetes control plane was not functioning.

**Lesson: SSH is your friend.** Before reaching for `kubectl`, make sure you can actually reach the nodes. A dead node is a very different problem from a broken etcd.

## Step 2: Check the Logs

With k0s, all control plane components run under a single systemd unit: `k0scontroller`. The logs are where the truth lives.

```bash
journalctl -u k0scontroller --no-pager -n 50
```

On pi-gamma, the logs told a clear story:

```
component=etcd: "bootstrap failed: cannot access data directory:
  open /var/lib/k0s/etcd/.touch: read-only file system"
component=kube-apiserver: "dial tcp 127.0.0.1:2379: connect: connection refused"
```

The API server couldn't connect to etcd because etcd was crash-looping. And etcd was crash-looping because the filesystem was read-only.

**Lesson: Follow the dependency chain.** API server needs etcd. Etcd needs a writable filesystem. The filesystem was read-only because the SD card had I/O errors. Fix from the bottom up.

## Step 3: Check the Filesystem

```bash
mount | grep " / "
# /dev/mmcblk0p2 on / type ext4 (rw,noatime,lazytime,emergency_ro)
```

The `emergency_ro` flag is the kernel's way of saying "I detected a filesystem error and remounted read-only to prevent data corruption." This is ext4's self-protection mechanism.

```bash
dumpe2fs /dev/mmcblk0p2 | grep -iE "errors|state|last"
# Filesystem state: clean with errors
# Errors behavior: Remount read-only
# Last error time: Thu Jul 23 01:30:01 2026
# Last error err: EIO
```

An EIO (Input/Output error) from July 23rd triggered the emergency remount. The SD card was dying.

I tried `e2fsck -y /dev/mmcblk0p2` but it couldn't fix the journal on a mounted filesystem, and the node eventually became unreachable entirely.

**Lesson: SD cards fail.** Especially on Raspberry Pis running etcd. If you're running a database on an SD card, you're living on borrowed time. Use NVMe or SSDs for anything that matters.

## Step 4: Recover etcd with --force-new-cluster

With two of three nodes dead, the etcd cluster had no quorum. Even though pi-gamma's etcd was running, it couldn't serve requests because it was stuck trying to reach the other two members.

The nuclear option: `--force-new-cluster`. This tells etcd to forget about all other members and reset the cluster to a single node using the local data directory.

Since k0s bundles etcd, I had to:
1. Stop k0scontroller: `systemctl stop k0scontroller`
2. Start etcd manually with `--force-new-cluster`, using the same flags k0s uses (found in the journalctl logs)
3. Verify etcd health with `etcdctl endpoint health`
4. Kill the manual etcd process
5. Restart k0scontroller: `systemctl start k0scontroller`

The key insight is that the etcd command-line flags are logged by k0s when it starts etcd. You can grep them from `journalctl` and reconstruct the exact invocation, adding `--force-new-cluster` at the end.

```bash
# Extract the etcd flags from journalctl
journalctl -u k0scontroller | grep "Running:" | head -1

# Then run etcd manually with those flags + --force-new-cluster
/var/lib/k0s/bin/etcd \
  --data-dir=/var/lib/k0s/etcd \
  --name=pi-gamma \
  --peer-cert-file=/var/lib/k0s/pki/etcd/peer.crt \
  --peer-client-cert-auth=true \
  --trusted-ca-file=/var/lib/k0s/pki/etcd/ca.crt \
  --cert-file=/var/lib/k0s/pki/etcd/server.crt \
  --listen-client-urls=https://127.0.0.1:2379 \
  --advertise-client-urls=https://127.0.0.1:2379 \
  --tls-min-version=TLS1.2 \
  --listen-peer-urls=https://192.168.8.15:2380 \
  --key-file=/var/lib/k0s/pki/etcd/server.key \
  --peer-trusted-ca-file=/var/lib/k0s/pki/etcd/ca.crt \
  --auth-token=jwt,pub-key=/var/lib/k0s/pki/etcd/jwt.pub,priv-key=/var/lib/k0s/pki/etcd/jwt.key,sign-method=RS512,ttl=10m \
  --initial-advertise-peer-urls=https://192.168.8.15:2380 \
  --peer-key-file=/var/lib/k0s/pki/etcd/peer.key \
  --client-cert-auth=true \
  --force-new-cluster
```

**Lesson: Always know where your etcd data directory and PKI certs are.** With k0s, they're under `/var/lib/k0s/etcd` and `/var/lib/k0s/pki/etcd/` respectively. If you don't have this information when things break, you'll waste precious time figuring it out.

After this, the API server came back:

```
NAME         STATUS     ROLES           AGE    VERSION
htpc         NotReady   <none>          27d    v1.35.1+k0s
pi-delta     Ready      control-plane   139d   v1.35.1+k0s
pi-epsilon   NotReady   control-plane   139d   v1.35.1+k0s
pi-gamma     Ready      control-plane   139d   v1.35.1+k0s
```

The cluster was alive, but the pods were still failing because all PVCs were pointing to the NFS server on `.13`, which was dead.

## Step 5: Migrate NFS Storage

The USB HDD from `.13` was moved to another node (`.12`, pi-beta). The disk had the same UUID, so mounting was straightforward:

```bash
mount -U 863e9ca8-746f-4214-9f8b-2aa3e13f4055 /mnt/hdd0
```

Since all the infrastructure is managed by Ansible, I just updated the inventory and group vars to move the NFS export configuration from pi-delta to pi-beta, and ran:

```bash
ansible-playbook homelab.yml -t storage -l pi-beta.lan
```

This mounted the disk, installed the NFS server, configured the export, and reloaded — all in one clean run.

Then I updated the StorageClass to point to the new NFS server:

```yaml
parameters:
  server: "192.168.8.12"  # was 192.168.8.13
  share: "/mnt/hdd0/homelab"
```

**Lesson: Infrastructure as Code pays off when you're stressed.** When a node dies and you need to move storage, having Ansible roles and version-controlled configs means you can migrate a disk to a new node in minutes, not hours.

## Step 6: Patch Existing PersistentVolumes

This is where things got spicy. The existing PVs were created by the NFS CSI provisioner and had the old server address (`192.168.8.13`) hardcoded in two places:

1. `spec.csi.volumeAttributes.server`
2. `spec.csi.volumeHandle` (e.g., `192.168.8.13#mnt/hdd0/homelab#pvc-xxx##`)

Kubernetes PVs are **immutable** — `kubectl patch` will refuse to change the CSI source. The approaches are:

### Option A: Delete and recreate (the clean way)
Delete the PVs (after removing finalizers), then recreate them with `kubectl create` using the correct server address. The data on disk is safe — it's just subdirectories on the NFS share.

### Option B: Direct etcd modification (the dangerous way)
Since both IPs are the same length (12 characters), you can theoretically do a binary search-and-replace directly in etcd. **I do not recommend this.** Kubernetes stores objects as protobuf, and `sed` can corrupt the binary data in subtle ways. The API server cache will also need a restart.

I tried option B, and it corrupted the StorageClass object in etcd, requiring manual deletion from etcd and recreation via kubectl.

**Lesson: Don't sed protobuf.** If you need to modify immutable Kubernetes objects, delete and recreate them through the API, not by poking at etcd directly. Take an etcd snapshot before trying anything risky:

```bash
etcdctl snapshot save /tmp/etcd-snapshot.db
```

## Step 7: Clear CSI Plugin State

After recreating the PVs, pods were still failing to mount with errors like:

```
An operation with the given Volume ID 192.168.8.13#...#pvc-xxx## already exists
```

The NFS CSI node plugin caches volume IDs in memory. When the volumeHandle changes (from `.13` to `.12`), the plugin sees a "new" volume ID but the target path is already mounted from the old one.

The fix: restart the CSI node pods to clear their in-memory state.

```bash
kubectl delete pods -n kube-system -l app=csi-nfs-node --grace-period=0 --force
```

Also, if the CSI node DaemonSet is scheduling pods on dead nodes, you need to delete those nodes from the cluster:

```bash
kubectl delete node pi-delta pi-epsilon --grace-period=0 --force
```

**Lesson: CSI plugins are stateful.** When you change volume handles or server addresses, the CSI node plugin needs a restart to pick up the changes. Stale mounts on the host can also cause "already exists" errors — sometimes you need to `umount -l` the old mount points.

## Step 8: Verify Recovery

After all the fixes, verify that:
- All PVs are Bound: `kubectl get pv`
- All PVCs are Bound: `kubectl get pvc -A`
- No pods are stuck in ContainerCreating: `kubectl get pods -A | grep -v Running`
- The CSI node plugin is registered: check `kubectl get csidriver` and that the CSI node pod is Running

## Lessons Learned

1. **Take etcd snapshots regularly.** Before any maintenance, after any fix. An etcd snapshot is your entire cluster state in a single file. Store it off-node.

2. **SD cards will fail.** Especially under write-heavy workloads like etcd. Use NVMe SSDs for control plane nodes, or at least schedule regular `fsck` on boot.

3. **Know your etcd flags.** When k0s (or kubeadm) starts etcd, it logs the full command line. Save this somewhere — you'll need it if you ever have to start etcd manually.

4. **Infrastructure as Code saves the day.** Being able to run `ansible-playbook -t storage -l pi-beta.lan` to set up a new NFS server in under a minute, with the exact same configuration as the old one, is invaluable when you're stressed.

5. **Don't modify etcd directly.** Use `kubectl` for everything. If objects are immutable, delete and recreate them. Direct etcd manipulation works in theory but corrupts protobuf-encoded data in practice.

6. **Follow the dependency chain.** Pod → PVC → PV → CSI plugin → NFS server → Disk. When something breaks, trace the chain from the bottom up. A dead disk looks like a broken pod at the top of the chain.

7. **Keep your inventory up to date.** Dead nodes in the inventory cause pods to schedule on unreachable nodes, which creates cascading failures. Remove dead nodes immediately.

8. **Reboot when in doubt.** Sometimes the cleanest way to clear stale state (CSI mounts, kubelet caches, filesystem errors) is a good old-fashioned reboot. Just make sure to run `fsck` on the way up.
