# Licenses

## Blue View code and assets

The tokens, stylesheets, the glass scene, the React component, the CSS
fallback, the examples, the scripts and the reference frames in this
repository are proprietary to Blue View Inc. and are for use in Blue View
products. Copyright (c) Blue View Inc. All rights reserved. They are not
licensed for use outside Blue View products.

## Third-party software

### three.js

- Version: 0.169.0 (`three@0.169.0`), a peer dependency of
  `backdrop/glass-scene.js`. It is not copied into this repository; apps
  install it, and the examples load it from cdn.jsdelivr.net.
- License: MIT. Copyright (c) 2010-2024 three.js authors.
- https://github.com/mrdoob/three.js and its license,
  https://github.com/mrdoob/three.js/blob/r169/LICENSE
- The scene also uses `RoomEnvironment` from three.js's examples
  (`three/examples/jsm/environments/RoomEnvironment.js`), under the same
  license.

An app that bundles three.js must keep its MIT notice with the bundle (most
bundlers' license output does this).

## Fonts

- Manrope and Inter, both under the SIL Open Font License 1.1
  (https://openfontlicense.org).
- Apps load them from the npm packages `@fontsource-variable/manrope` and
  `@fontsource-variable/inter`; the examples load the same packages
  (version 5.3.0) from cdn.jsdelivr.net. This repository contains no font
  files. Native apps that bundle the fonts include the OFL text with them.

## Images and textures

The backdrop uses no texture or image files. Its ground gradient and pools
of light are drawn procedurally on a canvas at run time, and its
environment light is three.js's `RoomEnvironment`, built in code.

The only images in this repository are the PNGs in
`examples/reference-frames/`, rendered by `scripts/still-frames.mjs` from
this repository's own code.
