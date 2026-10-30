---
name: Monochrome Editorial
colors:
  surface: '#f9f9fa'
  surface-dim: '#dadadb'
  surface-bright: '#f9f9fa'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f3f4'
  surface-container: '#eeeeef'
  surface-container-high: '#e8e8e9'
  surface-container-highest: '#e2e2e3'
  on-surface: '#1a1c1d'
  on-surface-variant: '#47464b'
  inverse-surface: '#2f3132'
  inverse-on-surface: '#f0f1f2'
  outline: '#77767b'
  outline-variant: '#c8c5cb'
  surface-tint: '#5f5e61'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#1b1b1e'
  on-primary-container: '#858387'
  inverse-primary: '#c8c5ca'
  secondary: '#5d5e66'
  on-secondary: '#ffffff'
  secondary-container: '#e3e1ec'
  on-secondary-container: '#63646c'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#1d1b16'
  on-tertiary-container: '#88837c'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e4e1e6'
  primary-fixed-dim: '#c8c5ca'
  on-primary-fixed: '#1b1b1e'
  on-primary-fixed-variant: '#47464a'
  secondary-fixed: '#e3e1ec'
  secondary-fixed-dim: '#c6c5cf'
  on-secondary-fixed: '#1a1b22'
  on-secondary-fixed-variant: '#46464e'
  tertiary-fixed: '#e8e2d9'
  tertiary-fixed-dim: '#cbc6bd'
  on-tertiary-fixed: '#1d1b16'
  on-tertiary-fixed-variant: '#494640'
  background: '#f9f9fa'
  on-background: '#1a1c1d'
  surface-variant: '#e2e2e3'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 56px
    fontWeight: '600'
    lineHeight: 64px
    letterSpacing: -0.03em
  display-lg-mobile:
    fontFamily: Inter
    fontSize: 36px
    fontWeight: '600'
    lineHeight: 44px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '500'
    lineHeight: 28px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 26px
    letterSpacing: -0.005em
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 22px
    letterSpacing: 0em
  label-md:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.06em
rounded:
  sm: 0.5rem
  DEFAULT: 1rem
  md: 1.5rem
  lg: 2rem
  xl: 3rem
  full: 9999px
spacing:
  gutter: 1.5rem
  gutter-mobile: 1rem
  margin: 3rem
  margin-mobile: 1.25rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

This design system embodies disciplined Swiss modernism with a contemporary high-fashion editorial clarity. The personality is rational, architectural, unapologetic, and pristine. Designed for discerning digital products, creative archives, high-end portfolios, and specialized SaaS tools, the interface strips away chromatic distractions to focus entirely on proportion, rhythm, and typographic authority.

The aesthetic fuses stark minimalism with functional tactility:
- Pure achromatic palette with decisive optical contrast.
- Hyper-rational grid structures paired with soft, generous pill contours for interactive elements.
- Spatial clarity where generous negative space acts as an active structural element rather than void.

## Colors

The palette is strictly achromatic, leveraging the calibrated neutrality of zinc tones to ensure neither warm nor cool color drift. Pure white provides the luminous canvas, while rich zinc-black anchors visual focus.

### Palette Architecture
- **Primary (`#18181B`)**: Used for high-emphasis typography, primary pill buttons, structural borders, and active icon states.
- **Secondary (`#71717A`)**: Mid-tier zinc applied to secondary metadata, supporting copy, inactive strokes, and subtle divider accents.
- **Neutral Surface (`#F4F4F5`)**: Recessed canvas tone, input field fills, alternating rows, and subtle container backdrops.
- **Pure Canvas (`#FFFFFF`)**: Card surfaces, primary sheet backdrops, and active toggle markers.
- **Border / Outline (`#E4E4E7`)**: Ultra-refined low-contrast divider lines and structural strokes.

Never introduce chromatic hues, tints, or colorized status indicators. Status must be communicated through stark contrast, solid fills versus outlines, typographic weight, and universally recognized iconography.

## Typography

Typographic rhythm relies exclusively on Inter, deployed with disciplined weight variance and tight negative tracking on larger display elements to evoke a sharp, editorial print publication.

### Typographic Rules
- **Tracking**: Large titles and display headers must use negative tracking (`-0.03em` to `-0.01em`) to tighten optical word shapes. Micro-labels (`label-sm`) require expanded tracking (`0.06em`) and uppercase transformation for crystalline legibility.
- **Hierarchy through Contrast**: Distinguish key content headers not by color, but by dramatic step-downs from semi-bold display headlines to regular body text.
- **Body & Editorial Reading**: Body copy maintains relaxed line heights (1.5x to 1.6x) to preserve effortless scanability against high-contrast surfaces.

## Layout & Spacing

The layout relies on a strict 12-column grid system on desktop, collapsing to 6 columns on tablet and 4 columns on mobile viewports. Spacing adheres to an 8-point base cadence, favoring large, airy breathing rooms over compressed density.

### Form Factor Adaptations
- **Desktop (1200px+)**: 12-column layout, outer canvas margin of `3rem` (`space-xl` + `space-md`), grid gutters of `1.5rem`. Max readable text container is pinned to 680px (columns 4–9).
- **Tablet (768px - 1199px)**: 6-column layout, outer margin scales to `2rem`, gutters maintain `1.5rem`. Complex asymmetric columns collapse into 50/50 blocks.
- **Mobile (< 768px)**: 4-column layout, margins compress to `1.25rem`, gutters drop to `1rem`. All horizontal split layouts stack vertically.

## Elevation & Depth

This design system completely discards heavy drop shadows and ambient colored blurs in favor of architectural, planar depth:

1. **Subtle Hairline Outlines**: Depth is primarily established by crisp, 1px borders (`#E4E4E7`) defining card geometries against white backgrounds.
2. **Surface Layering**: Secondary elevation is conveyed by placing white (`#FFFFFF`) card surfaces on top of faint zinc-tinted (`#F4F4F5`) canvas regions.
3. **Elevated Floating States**: Dropdowns, dialogs, and flyout menus employ a single, featherweight, razor-sharp edge shadow: `0 4px 20px -2px rgba(24, 24, 27, 0.06), 0 0 0 1px rgba(24, 24, 27, 0.08)`. This creates razor-precise definition without muddiness.

## Shapes

The geometric identity is defined by a striking contrast between rectangular, structural grid containers and soft, organic pill forms.

- **Buttons, Badges, Chips, Inputs**: Always fully pill-shaped (`border-radius: 9999px` or level 3 tokens). This introduces warmth and tactile clarity to interactive touchpoints.
- **Cards, Panels, Modals**: Maintain a consistent `rounded-lg` (2rem) or `rounded-xl` (3rem) corner radius, balancing the sharp grid lines with modern, sculptural contours.
- **Dividers & Structural Borders**: Sharp, 1px hair-lines running full bleed or bounded by component padding.

## Components

### Buttons
- **Primary Pill**: Pure black fill (`#18181B`), crisp white text (`#FFFFFF`), bold pill shape (`rounded-full`), height 44px (padding: `0 24px`). Hover state: `#27272A` with a micro-scale transition (`scale-[1.01]`). Active state: `#09090B`.
- **Secondary Outline Pill**: Pure white or transparent background, 1px border (`#18181B`), black text (`#18181B`), pill radius. Hover: `#18181B` background with inverted white text.
- **Subtle / Ghost Pill**: Transparent surface, secondary text (`#71717A`). Hover: `#F4F4F5` fill with primary text (`#18181B`).

### Chips & Badges
- Continuous pill radius. Solid micro-badges use `#18181B` fill with `#FFFFFF` text (label-sm).
- Secondary metadata chips use `#F4F4F5` fill, `#18181B` label, and a 1px border in `#E4E4E7`.

### Input Fields
- Enclosed in a 44px pill container (`rounded-full`), `#FFFFFF` background, 1px stroke in `#E4E4E7`, horizontal padding of 20px.
- Focus state shifts the border to 1.5px solid `#18181B` with no color rings.
- Placeholder text rendered in muted zinc (`#A1A1AA`).

### Checkboxes & Radio Controls
- Checkboxes: 18x18px with `rounded-[6px]`, 1.5px border (`#18181B`). Checked: solid `#18181B` fill with a sharp white checkmark.
- Radios: 18x18px pure circle, 1.5px border (`#18181B`). Selected: solid `#18181B` outer ring with a 6px centered white aperture or inner dot.

### Cards & Surfaces
- Canvas: Clean `#FFFFFF` fill framed by a 1px `#E4E4E7` border with `rounded-xl` (3rem) corner radiuses.
- Internal padding calibrated strictly to `space-lg` (24px) or `space-xl` (40px) depending on density.
- Hoverable cards transition the border to `#18181B` with an instantaneous 150ms ease, retaining an editorial, ink-on-paper sharpness.

### Segmented Controls & Tabs
- Outer container: Fully pill-shaped (`rounded-full`), filled with `#F4F4F5`, 4px internal padding.
- Active pill item: Pure white `#FFFFFF` surface with micro-drop outline (`0 1px 3px rgba(0,0,0,0.06)`), text in `#18181B`. Inactive items: text in `#71717A`.