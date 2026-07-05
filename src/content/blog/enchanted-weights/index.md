---
title: Enchanted weights
published: 2025-04-03
type: writeup
series: CyberApocalypse 2025
part: 1
tags:
  - AI
---

This was just a warmup misc, we are provided with a `eldorian_artifact.pth`, just load it up with pytorch, have a look at the weights

```Python
import torch

model = torch.load('eldorian_artifact.pth')
model['hidden.weight']
```

```Python
tensor([[72.,  0.,  0.,  ...,  0.,  0.,  0.],
        [ 0., 84.,  0.,  ...,  0.,  0.,  0.],
        [ 0.,  0., 66.,  ...,  0.,  0.,  0.],
        ...,
        [ 0.,  0.,  0.,  ..., 95.,  0.,  0.],
        [ 0.,  0.,  0.,  ...,  0., 95.,  0.],
        [ 0.,  0.,  0.,  ...,  0.,  0., 95.]])
```

there seem to be ASCII characters along the diagonal, so I just try to print all the nonzeros

```Python
model['hidden.weight']
for elem in model['hidden.weight']:
    for e in elem:
        if e.item() > 0:
            val = int(e.item())
            print(chr(val), end='')
```

```Python
HTB{Cry5t4l_RuN3s_0f_Eld0r1a}___________
```