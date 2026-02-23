---
github: https://github.com/di3go-sona/rpi-flasher
published: 2026-02-23
tags:
- Homelab
- RPi
title: Writing my own RPi image flasher

---

I wanted to build my own Kubernetes Homelab, but, as in my job I deal with Bare Metal provisioning on a daily basis I felt quite stupid having to manually flash 5 images, so, instead of wasting a few hours now and then, why not _invest_ a few weeks to create my own RPi image builder.

Did it save time ? Maybe, probably not yet, but it surprisingly save me a lot of time already 

_But_ it also allows me to:
- Store my OS config in a yaml file
- Have a reproducible and consistent way to provision my Homelab 
- Customise DietPi and other distros, flash directly from the CLI instead of clicking buttons and moving files around
- Not being bored as all by a repetitive procedure 

Did it make sense ? Time will tell, but for me it's clearly a win

### The recon
So how do you build an image flasher? Well, my initial concern was that you needed some kind of trickery and/or black magic to make a downloaded .img actually bootable. So I started looking around and I found this amazing post from Pascal Poerri's [post](https://www.pascalspoerri.ch/blog/2022-07-10-raspberry-pi-setup/ ) in which he explains that basically you just have to locate your device and `dd` it

```bash
$ sudo dd bs=1m if=2022-04-04-raspios-bullseye-arm64-lite.img of=/dev/rdisk4 status=progress
```

that's it ? really ? `dd` is all you need ? or at least I though so
I started to break down the problem and I realized I needed 4 steps
- download
- extract
- *edit files*
- flash
Well it turns out that 3 out of 4 are quite easy to implement, especially with the help of Claude the hardest part was usually the progress bar.

### The implementation
So, for the implementation iI choose python as it's the language I'm more familiar with, but maybe I golang would have been an even better idea.
The biggest part of the implementation is editing the filesystem. 
For starters the image is `.iso`, this means that it's a byte to byte copy of a real disk

```bash
$ file DietPi_RPi1-ARMv6-Trixie.img

DietPi_RPi1-ARMv6-Trixie.img: DOS/MBR boot sector; partition 1 : ID=0xc, active, start-CHS (0x10,0,1), end-CHS (0x3ff,3,32), startsector 2048, 262144 sectors; partition 2 : ID=0x83, start-CHS (0x10,113,34), end-CHS (0x71,183,46), startsector 264192, 1562728 sectors
```
Therefore the first bytes are the MBR partition table
```bash
$ hdiutil pmap DietPi_RPi1-ARMv6-Trixie.img       

MEDIA: ""; Size 892 MB [1826920 x 512]; Max Transfer Blocks 2048
SCHEME: 1 MBR, "PC Partition Scheme" [8]
SECTION: 1 Type:'MAP'; Size 892 MB [1826920 x 512]; Offset 0 Blocks (1826919 + 1) x 512
ID Type                 Offset       Size         Name                      (3)
-- -------------------- ------------ ------------ -------------------- --------
 0 MBR                             0            1
   Free                            1         2047
 1 Windows_FAT_32               2048       262144
 2 Linux                      264192      1562728
```
and there are two partitions, FAT32 and Linux (probably) EXT4. This normally means that 

FAT32 -> `/boot`
EXT4 -> `/`

```bash 
$ ls -alh /boot/

total 9.6M
drwxr-xr-x  4 root root 4.0K Feb  2 17:54 .
drwxr-xr-x 18 root root 4.0K Jan 26 05:02 ..
-rw-r--r--  1 root root   83 Dec 18 18:17 System.map-6.12.62+rpt-rpi-2712
lrwxrwxrwx  1 root root   20 Jan 26 05:01 cmdline.txt -> firmware/cmdline.txt
-rw-r--r--  1 root root 244K Dec 18 18:17 config-6.12.62+rpt-rpi-2712
lrwxrwxrwx  1 root root   19 Jan 26 05:01 config.txt -> firmware/config.txt
drwxr-xr-x  4 root root 4.0K Feb  2 17:56 dietpi
-rw-r--r--  1 root root  18K Jan 25 23:34 dietpi-LICENSE.txt
-rw-r--r--  1 root root  17K Jan 25 23:34 dietpi-README.md
-rw-------  1 root root 3.9K Jan 26 05:02 dietpi-wifi.txt
-rw-r--r--  1 root root  20K Feb  2 17:54 dietpi.txt
drwxr-xr-x  5 root root 4.0K Jan  1  1970 firmware
-rw-r--r--  1 root root 9.3M Dec 18 18:17 vmlinuz-6.12.62+rpt-rpi-2712
```
Now how do we modify a filesystem ? MacOS has no native support for `ext4`, I could've used FUSE, but I think that macFUSE is an awkward piece of software, and definitely not an easy dependency to package, I would like this tool to be as lightweight as possible.
Unfortunately there is no software library to manipulate `ext4`, another alternative would be to use containers or VM, but for now the important part partition is `/boot/` that is `fat32` and is a lot easier.
I could have extracted the partition, mounted it, edited and then copied it back in the `.iso`, but I preferred to go only software-based without going trough the OS.

So I will first locate the beginning of the `boot` partition
```python
def _locate_boot_partition(image_path: str) -> int:
	fat_partition_start = None
	with open(image_path, 'rb') as img_file:
		img_file.seek(0x1BE)
		for _ in range(4):
			partition_entry = img_file.read(16)
			partition_type = partition_entry[4]
			if partition_type in (0x0B, 0x0C, 0x0E, 0x06):
				start_sector = \
					int.from_bytes(partition_entry[8:12], 'little')
				fat_partition_start = start_sector * 512
				break
	
	if fat_partition_start is None:
		 raise Exception("FAT partition not found in the image.")

	return fat_partition_start
```
And then replace the existing file
```python

def _inject_file(image_path: str, filename: str, content: str):
	partition_offset = ImageProcessor._locate_boot_partition(image_path)
	
	with fs.open_fs(f"fat://{image_path}?offset={partition_offset}") as fat_fs:
		target_path = None
		for path in fat_fs.walk.files():
			if fat_fs.getinfo(path).is_file and path.endswith(filename):
				target_path = path
				break

		if target_path is None:
			raise Exception(f"{filename} not found in the FAT partition.")
		
		fat_fs.remove(target_path)

		with fat_fs.open(target_path, 'wb') as config_file:
			config_file.write(content.encode('utf-8'))
		
		# Simple check if file exists
		if fat_fs.exists(target_path):
			 log_success(f"Successfully wrote {target_path}")
```
Then flash the image
```python
    def flash(source_path: str, 
			  device_path: str, 
			  progress_callback: Optional[Callable[[int, int], None]] = None):
			  
        if not os.path.exists(source_path):
             raise FileNotFoundError(f"Source file not found: {source_path}")

        total_size = os.path.getsize(source_path)
        processed = 0
        
        # Check permissions by trying to open open for write
        try:
            with open(device_path, 'wb'):
                pass
        except PermissionError:
             raise PermissionError(f"Permission denied accessing {device_path}")
        except Exception:
             pass # Ignore other errors, let the actual write fail if needed

        with open(source_path, 'rb') as src_file:
            with open(device_path, 'wb') as dest_file:
                while True:
                    chunk = src_file.read(4 * 1024 * 1024) 
                    if not chunk:
                        break
                    dest_file.write(chunk)
                    dest_file.flush()
                    os.fsync(dest_file.fileno())
                    processed += len(chunk)
                    if progress_callback:
                        progress_callback(processed, total_size)
```
Then wrap it up into a configfile
```yaml
global:
  url: https://dietpi.com/downloads/images/DietPi_RPi1-ARMv6-Trixie.img.xz
  device: /dev/null
  templates:
    - dietpi.txt.j2
values:
  hostname: rpi
  address: 192.168.0.11
  mask: 255.255.255.0
  gateway: 192.168.0.1
  dns: 192.168.0.1
  password: dietpi
```
And package it into a nice application
```bash
rpi-flasher                                                                          
Usage: rpi-flasher [OPTIONS] COMMAND [ARGS]...

  RPI Flasher - A tool for building and flashing Raspberry Pi DietPi images

Options:
  --version  Show the version and exit.
  --help     Show this message and exit.

Commands:
  build      Build a configured DietPi image
  devices    List connected storage devices
  download   Download a DietPi image from URL
  flash      Build and flash a configured DietPi image to a device
  images     List available DietPi images
  templates  List builtin templates
```