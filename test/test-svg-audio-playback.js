/**
 * Deep Browser Audio Validation Test using Playwright
 *
 * Actually attempts to play embedded audio and captures all
 * media-related errors that occur during playback.
 */

import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SVG_PATH = path.join(__dirname, '../samples/SVG_WITH_EMBEDDED_AUDIO/cartoon_sample_with_audio.svg');

async function validateAudioInBrowser(svgPath) {
  console.log('='.repeat(70));
  console.log('Deep Audio Validation Test');
  console.log('='.repeat(70));
  console.log(`\nSVG File: ${svgPath}`);

  const svgContent = await fs.readFile(svgPath, 'utf8');
  console.log(`File size: ${(svgContent.length / 1024).toFixed(2)} KB`);

  // Check audio data URI format
  const audioMatches = svgContent.matchAll(/data:audio\/([^;,]+);?([^,]*),([A-Za-z0-9+/=]{0,100})/g);
  console.log('\nEmbedded Audio Analysis:');
  let audioIndex = 0;
  for (const match of audioMatches) {
    audioIndex++;
    const mimeSubtype = match[1];
    const encoding = match[2] || 'none';
    const dataStart = match[3];
    console.log(`  Audio ${audioIndex}: type=audio/${mimeSubtype}, encoding=${encoding}`);
    console.log(`    Data starts with: ${dataStart.substring(0, 50)}...`);

    // Check for valid base64 encoding
    if (encoding === 'base64') {
      const isValidBase64Start = /^[A-Za-z0-9+/]/.test(dataStart);
      console.log(`    Valid base64 start: ${isValidBase64Start}`);
    }
  }

  console.log('\nLaunching headless Chrome with audio enabled...');
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--autoplay-policy=no-user-gesture-required',
      '--disable-web-security',
      '--allow-file-access-from-files',
      '--enable-features=AutoplayIgnoreWebAudio',
    ]
  });

  const context = await browser.newContext({
    bypassCSP: true,
    ignoreHTTPSErrors: true,
  });

  const page = await context.newPage();

  const allMessages = [];
  const errors = [];
  const mediaErrors = [];

  page.on('console', msg => {
    const entry = { type: msg.type(), text: msg.text() };
    allMessages.push(entry);
    if (msg.type() === 'error') {
      errors.push(entry);
    }
  });

  page.on('pageerror', error => {
    errors.push({ type: 'pageerror', text: error.message, stack: error.stack });
  });

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Audio Validation Test</title>
</head>
<body>
  <h2>Audio Validation Test</h2>
  <div id="status"></div>
  <div id="svg-container">
    ${svgContent}
  </div>
  <script>
    const status = document.getElementById('status');
    function log(msg) {
      console.log('AUDIO_TEST: ' + msg);
      status.innerHTML += msg + '<br>';
    }

    document.addEventListener('DOMContentLoaded', async function() {
      log('DOM loaded');

      const audioElements = document.querySelectorAll('audio');
      log('Found ' + audioElements.length + ' audio elements');

      for (let i = 0; i < audioElements.length; i++) {
        const audio = audioElements[i];
        log('\\n=== Testing audio[' + i + '] id=' + audio.id + ' ===');

        // Get source info
        const sources = audio.querySelectorAll('source');
        log('Source count: ' + sources.length);

        for (let j = 0; j < sources.length; j++) {
          const source = sources[j];
          const src = source.getAttribute('src');
          const type = source.getAttribute('type');
          log('Source[' + j + ']: type=' + type);

          if (src && src.startsWith('data:')) {
            log('Source[' + j + ']: Has data URI (length=' + src.length + ')');

            // Parse and validate the data URI
            const dataUriMatch = src.match(/^data:([^;,]+)(;[^,]*)?,(.*)$/);
            if (dataUriMatch) {
              const mimeType = dataUriMatch[1];
              const encoding = dataUriMatch[2] || '';
              const dataLength = dataUriMatch[3].length;
              log('  MIME type: ' + mimeType);
              log('  Encoding: ' + encoding);
              log('  Data length: ' + dataLength + ' chars');

              // Check if it's actually valid base64
              if (encoding.includes('base64')) {
                const base64Data = dataUriMatch[3];
                // Check for invalid characters
                const invalidChars = base64Data.match(/[^A-Za-z0-9+/=]/g);
                if (invalidChars) {
                  console.error('AUDIO_TEST: Invalid base64 characters found: ' + JSON.stringify([...new Set(invalidChars)]));
                } else {
                  log('  Base64 data appears valid');
                }

                // Try to decode a sample
                try {
                  const sample = base64Data.substring(0, 100);
                  const decoded = atob(sample);
                  log('  Base64 decodes successfully (first 100 chars)');

                  // Check for MP3 magic bytes (ID3 or sync word)
                  const bytes = [];
                  for (let k = 0; k < Math.min(4, decoded.length); k++) {
                    bytes.push(decoded.charCodeAt(k).toString(16).padStart(2, '0'));
                  }
                  log('  First bytes: ' + bytes.join(' '));

                  // ID3 tag starts with 'ID3' (0x49 0x44 0x33)
                  // MP3 sync word is 0xFF 0xFB or 0xFF 0xFA or 0xFF 0xF3
                  if (decoded.startsWith('ID3')) {
                    log('  Detected: ID3 tag present');
                  } else if (bytes[0] === 'ff' && (bytes[1] === 'fb' || bytes[1] === 'fa' || bytes[1] === 'f3')) {
                    log('  Detected: MP3 sync word');
                  } else {
                    console.error('AUDIO_TEST: Unknown audio format - first bytes: ' + bytes.join(' '));
                  }
                } catch (e) {
                  console.error('AUDIO_TEST: Base64 decode error: ' + e.message);
                }
              }
            } else {
              console.error('AUDIO_TEST: Invalid data URI format');
            }
          }
        }

        // Set up error handlers before loading
        audio.onerror = function(e) {
          const error = audio.error;
          let errorMsg = 'Unknown error';
          if (error) {
            switch (error.code) {
              case MediaError.MEDIA_ERR_ABORTED: errorMsg = 'MEDIA_ERR_ABORTED'; break;
              case MediaError.MEDIA_ERR_NETWORK: errorMsg = 'MEDIA_ERR_NETWORK'; break;
              case MediaError.MEDIA_ERR_DECODE: errorMsg = 'MEDIA_ERR_DECODE'; break;
              case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED: errorMsg = 'MEDIA_ERR_SRC_NOT_SUPPORTED'; break;
            }
            errorMsg += ' - ' + (error.message || 'no message');
          }
          console.error('AUDIO_TEST: Media error on audio[' + i + ']: ' + errorMsg);
        };

        audio.onloadedmetadata = function() {
          log('audio[' + i + '] metadata loaded - duration: ' + audio.duration + 's');
        };

        audio.oncanplay = function() {
          log('audio[' + i + '] can play');
        };

        audio.oncanplaythrough = function() {
          log('audio[' + i + '] can play through');
        };

        // Try to load the audio
        log('Loading audio[' + i + ']...');
        audio.load();

        // Wait for load or error
        await new Promise(resolve => {
          let resolved = false;
          const timeout = setTimeout(() => {
            if (!resolved) {
              resolved = true;
              log('audio[' + i + '] load timeout');
              resolve();
            }
          }, 5000);

          audio.oncanplaythrough = function() {
            if (!resolved) {
              resolved = true;
              clearTimeout(timeout);
              log('audio[' + i + '] loaded successfully');
              resolve();
            }
          };

          audio.onerror = function() {
            if (!resolved) {
              resolved = true;
              clearTimeout(timeout);
              const error = audio.error;
              let errorMsg = 'Unknown error';
              if (error) {
                switch (error.code) {
                  case MediaError.MEDIA_ERR_ABORTED: errorMsg = 'MEDIA_ERR_ABORTED'; break;
                  case MediaError.MEDIA_ERR_NETWORK: errorMsg = 'MEDIA_ERR_NETWORK'; break;
                  case MediaError.MEDIA_ERR_DECODE: errorMsg = 'MEDIA_ERR_DECODE'; break;
                  case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED: errorMsg = 'MEDIA_ERR_SRC_NOT_SUPPORTED'; break;
                }
                errorMsg += ' (code=' + error.code + ')';
              }
              console.error('AUDIO_TEST: LOAD ERROR audio[' + i + ']: ' + errorMsg);
              resolve();
            }
          };
        });

        // Try to play
        log('Attempting to play audio[' + i + ']...');
        try {
          await audio.play();
          log('audio[' + i + '] playing!');
          audio.pause();
          log('audio[' + i + '] paused after test');
        } catch (e) {
          console.error('AUDIO_TEST: PLAY ERROR audio[' + i + ']: ' + e.message);
        }
      }

      log('\\n=== Validation complete ===');
    });
  </script>
</body>
</html>
`;

  console.log('Loading SVG in browser and testing audio...');
  await page.setContent(htmlContent, { waitUntil: 'networkidle' });
  await page.waitForTimeout(10000); // Wait for audio tests to complete

  await browser.close();

  console.log('\n' + '='.repeat(70));
  console.log('TEST RESULTS');
  console.log('='.repeat(70));

  console.log('\n--- All Messages ---');
  for (const msg of allMessages) {
    const prefix = msg.type === 'error' ? '[ERROR]' : '[LOG]';
    console.log(`${prefix} ${msg.text}`);
  }

  console.log('\n--- Errors Only ---');
  if (errors.length === 0) {
    console.log('  No errors detected');
  } else {
    for (const err of errors) {
      console.log(`  ${err.text}`);
    }
  }

  console.log('\n' + '='.repeat(70));
  return { errors, allMessages };
}

validateAudioInBrowser(SVG_PATH)
  .then(result => {
    console.log(`\nTotal errors: ${result.errors.length}`);
    process.exit(result.errors.length > 0 ? 1 : 0);
  })
  .catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
  });
