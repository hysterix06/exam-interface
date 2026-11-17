# Embedded widgets

Any web tool can be a question if it speaks a three-message `postMessage` protocol (`src/engine/widget.ts`):

```
exam   → widget   { type: "exam:init", version: 1, state, config, readOnly }
widget → exam     { type: "exam:ready", version: 1 }
widget → exam     { type: "exam:response", version: 1, state }
```

The exam stores `state` as the answer, and checks read values out of it (`total`, `order.length`). Widgets are static files in `public/widgets/`, served same-origin in a sandboxed iframe, and chosen from a registry rather than typed as URLs. Two demos are included:
- `pos-demo`, a point-of-sale till;
- `pms-demo`, a hotel front desk: check a guest into a suitable clean room and post charges to the folio.

