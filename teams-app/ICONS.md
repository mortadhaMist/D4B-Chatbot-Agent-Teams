# Teams App Icons Setup

The Teams app manifest requires two icon files in the `teams-app/` folder:

## Required Icons

1. **color.png** (192×192 pixels)
   - Full color logo
   - Use the DIGITAL4BUSINESS logo
   - Background should be opaque (preferably the brand color #25346f)

2. **outline.png** (32×32 pixels)
   - Transparent background
   - White or light color icon outline only
   - Used in Teams navigation

## Quick Setup Options

### Option 1: Use Your Logo
1. Resize your DIGITAL4BUSINESS logo to 192×192 and save as `color.png`
2. Create a white outline version at 32×32 and save as `outline.png`

### Option 2: Use Online Tools
1. Visit [canva.com](https://www.canva.com) or similar design tool
2. Create a 192×192 square design with your brand colors and logo
3. Export as PNG and save to `teams-app/color.png`
4. Create a white 32×32 icon outline, export as `teams-app/outline.png`

### Option 3: Placeholder Icons (Temporary)
If you don't have icons yet, you can temporarily create simple placeholder PNGs:
- Use an online PNG generator to create the correct sizes
- Or skip icon setup for now and add later

## Verification

After adding both files, verify they're in the correct location:
```
teams-app/
├── manifest.json
├── color.png (192×192)
├── outline.png (32×32)
└── SETUP.md
```

## Icon Guidelines

- Use PNG format with transparency where needed
- Keep outlines simple and recognizable at small sizes
- Ensure outline.png is white (#FFFFFF) on transparent background
- Ensure color.png has good contrast and brand consistency
