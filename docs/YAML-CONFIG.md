# YAML Configuration Support for SVGM CLI

## Overview

The `svgm` CLI now supports loading configuration from YAML files using the `--config <path>` option. This makes it easier to manage complex embedding configurations and share settings across projects.

## Usage

### Basic Usage

```bash
# Use a config file
svgm input.svg --config svgm.yml -o output.svg

# CLI flags override config file settings
svgm input.svg --config svgm.yml --embed-fonts -o output.svg
```

### Configuration File Structure

Create a YAML file (e.g., `svgm.yml`) with the following structure:

```yaml
# Embedding options
embed:
  # Embed external images as data URIs
  images: true

  # Embed external SVG files
  externalSVGs: true

  # Mode for external SVGs: 'extract' or 'full'
  externalSVGMode: 'extract'

  # Embed external CSS files
  css: true

  # Embed external font files
  fonts: true

  # Embed external JavaScript files
  scripts: true

  # Embed external audio files
  audio: true

  # Subset fonts to include only used glyphs
  subsetFonts: true

  # Recursively process embedded resources
  recursive: true

  # Maximum recursion depth
  maxRecursionDepth: 10

  # Timeout for external resources (ms)
  timeout: 30000

  # Handle missing resources: 'warn', 'fail', or 'skip'
  onMissingResource: 'warn'

# Other optimization options
precision: 6
multipass: false
pretty: false
indent: 2
quiet: false
```

## CLI Flags

### Embed Flags

All embed options are also available as CLI flags:

- `--embed` or `--embed-all` - Enable all embedding options
- `--embed-images` - Embed external images as data URIs
- `--embed-external-svgs` - Embed external SVG files
- `--embed-svg-mode <mode>` - Mode for external SVGs: 'extract' or 'full'
- `--embed-css` - Embed external CSS files
- `--embed-fonts` - Embed external font files
- `--embed-scripts` - Embed external JavaScript files
- `--embed-audio` - Embed external audio files
- `--embed-subset-fonts` - Subset fonts to used glyphs only
- `--embed-recursive` - Recursively embed dependencies
- `--embed-max-depth <n>` - Maximum recursion depth (default: 10)
- `--embed-timeout <ms>` - Timeout for external resources (default: 30000)
- `--embed-on-missing <mode>` - Handle missing resources: 'warn', 'fail', 'skip'

### Examples

```bash
# Embed all external dependencies
svgm input.svg --embed-all -o output.svg

# Embed only fonts and images
svgm input.svg --embed-fonts --embed-images -o output.svg

# Use config file with CLI override
svgm input.svg --config svgm.yml --embed-on-missing fail -o output.svg

# Embed with custom timeout and recursion depth
svgm input.svg --embed-all --embed-timeout 60000 --embed-max-depth 5 -o output.svg
```

## Configuration Priority

When both a config file and CLI flags are provided:

1. Default configuration is loaded
2. YAML config file settings override defaults
3. CLI flags override both defaults and config file settings

This allows you to have base settings in a config file and override specific options via CLI.

## Example Config Files

### Minimal Embedding (fonts and images only)

```yaml
embed:
  images: true
  fonts: true
  subsetFonts: true
  onMissingResource: 'warn'
```

### Full Embedding (all resources)

```yaml
embed:
  images: true
  externalSVGs: true
  externalSVGMode: 'extract'
  css: true
  fonts: true
  scripts: true
  audio: true
  subsetFonts: true
  recursive: true
  maxRecursionDepth: 10
  timeout: 30000
  onMissingResource: 'warn'

# Optimization settings
precision: 6
multipass: true
pretty: false
```

### Production Build

```yaml
embed:
  images: true
  fonts: true
  css: true
  subsetFonts: true
  recursive: false
  onMissingResource: 'fail'

precision: 4
multipass: true
quiet: true
```

## Notes

- The `embedExternalDependencies` function must be available in `svg-toolbox.js` for embedding to work
- If the function is not available, a warning will be displayed and embedding will be skipped
- The `baseDir` for resolving relative paths is automatically set to the directory of the input file
- See `svgm.example.yml` for a complete example configuration file
