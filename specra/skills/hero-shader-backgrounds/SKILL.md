---
name: hero-shader-backgrounds
description: Automatically create abstract, modern hero backgrounds and ambient page backdrops with `@paper-design/shaders-react` when the user asks for an abstract background, modern background, shader backdrop, or visually rich landing-page background in a React/Next.js UI.
---

# Hero Shader Backgrounds

Use this skill when the user asks for:

- an abstract background, modern background, ambient page backdrop, or visually rich landing-page background
- a hero image, animated hero visual, shader backdrop, or Paper Design shader treatment
- Paper Design shader usage in a Specra-grounded UI
- converting extracted visual atmosphere into a shader-backed React/Next.js hero surface

The user does not need to mention `@paper-design/shaders-react`. If they explicitly ask for an "abstract" or "modern" hero/background visual, treat this skill as the default path.

Do not use this skill for ordinary UI implementation unless the hero/background itself is part of the task. Pair it with `implement-ui` when the shader background is one part of a broader Specra UI build.

## Core Workflow

1. Load the current Specra context first when the repo has `.specra.json`.
2. Read the current `DESIGN.md` and `theme.css`; use them to choose mood, color temperature, density, border posture, and foreground contrast.
3. Check whether the target package already depends on `@paper-design/shaders-react`.
   - In this repo, `apps/nextjs` already has it.
   - If missing in another target app, add it to that app/package, not to the Specra plugin package.
4. Inspect the installed package types when using unfamiliar props:
   - `node_modules/**/@paper-design/shaders-react/dist/index.d.ts`
   - `node_modules/**/@paper-design/shaders/dist/shaders/*.d.ts`
5. Build a small reusable hero/background component, then compose page content above it.
6. Run typecheck/lint and visually verify in a browser screenshot before finishing.

Default behavior: implement the background directly. Do not ask the user to pick a shader, palette, or motion style unless the request is too ambiguous to place in the current product surface.

## Design Rules

- Treat the shader as an art-directed backdrop, not decoration. It should support the product message and reading flow.
- Derive colors from `theme.css` roles or from clearly stated `DESIGN.md` mood guidance. Avoid random neon palettes.
- Keep text contrast independent of the shader: add a stable overlay/tint/surface layer when text sits above moving pixels.
- Use restrained motion. Prefer `speed={0}` or low values like `0.08` to `0.25` unless the product needs energy.
- Keep the shader behind content with `absolute inset-0`, `pointer-events-none`, and `aria-hidden`.
- Use `maxPixelCount` and `minPixelRatio` on large full-viewport shaders to avoid expensive WebGL rendering.
- If the broader design system forbids gradients but the user explicitly asks for Paper shaders, the explicit shader request wins; keep it subtle and document the choice in the final summary.

## Component Selection

Prefer these for hero images/backgrounds:

- `StaticMeshGradient`: static atmospheric hero image, best for product landing pages and readable hero copy.
- `MeshGradient`: slow animated atmospheric field.
- `GrainGradient`: textured, editorial, tactile hero fields.
- `FlutedGlass`: refracted image-backed bands or background treatment; pass an `image` URL and use `fit="cover"`.
- `NeuroNoise`, `Waves`, `Warp`, `GodRays`: use only when the reference mood calls for strong motion or futuristic energy.

Avoid highly busy shaders directly under body text. If a vivid shader is required, crop it into a contained visual panel or put a calm foreground surface above it.

## Implementation Pattern

For Next.js App Router, importing these components from a Server Component can work because the package marks the shader mount as client code. If hydration or build errors appear, isolate the shader in a small `"use client"` component.

```tsx
import { StaticMeshGradient } from "@paper-design/shaders-react";

export function HeroShaderBackdrop() {
  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden
    >
      <StaticMeshGradient
        width="100%"
        height="100%"
        colors={["#f8fafc", "#dbeafe", "#94a3b8", "#0f172a"]}
        positions={42}
        waveX={0.18}
        waveY={0.12}
        mixing={0.72}
        grainMixer={0.08}
        grainOverlay={0.04}
        fit="cover"
        scale={1.12}
        minPixelRatio={1}
        maxPixelCount={1400000}
        className="h-full w-full"
      />
      <div className="bg-background/70 absolute inset-0" />
    </div>
  );
}
```

Use it in a hero section like this:

```tsx
<section className="bg-background text-foreground relative isolate min-h-[720px] overflow-hidden">
  <HeroShaderBackdrop />
  <div className="relative mx-auto flex min-h-[720px] max-w-6xl flex-col justify-center px-6 py-20">
    {/* hero content */}
  </div>
</section>
```

For an image-backed refractive hero:

```tsx
import { FlutedGlass } from "@paper-design/shaders-react";

<FlutedGlass
  width="100%"
  height="100%"
  image="/hero-reference.jpg"
  colorBack="#00000000"
  colorShadow="#020617"
  colorHighlight="#ffffff"
  size={0.65}
  shape="linesIrregular"
  distortionShape="flat"
  distortion={0.85}
  blur={0.8}
  edges={0.45}
  grainMixer={0.08}
  grainOverlay={0.06}
  fit="cover"
  scale={2.5}
  minPixelRatio={1}
  maxPixelCount={1400000}
/>;
```

## Verification

- Run the narrowest useful code validation, usually package typecheck and lint.
- Open the local preview and inspect desktop and mobile hero framing.
- Confirm the canvas is nonblank, fills the intended region, sits behind content, and does not reduce text contrast.
- Check browser console for WebGL, image loading, CORS, or hydration errors.
- If a static hero image asset is requested instead of a live shader, render the route and capture/export the shader area as an image only after the live shader is verified.
