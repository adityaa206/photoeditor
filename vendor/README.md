# vendor/

Runtime assets that are downloaded, not committed. Run `npm run fetch-vendor` to populate:

- `ort/` — ONNX Runtime Web (WebAssembly build) for the AI background remover
- `models/silueta.onnx` — U²-Net "silueta" segmentation model (44 MB, Apache-2.0, from the rembg project)
- `libs/` — UTIF (TIFF/RAW), heic2any (HEIC), ag-psd (Photoshop PSD)

The browser version falls back to CDN copies of these files when this folder is missing;
the desktop build bundles them so it works offline.
