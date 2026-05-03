# Report: Particle Text Effect Timing Adjustment

## Overview
Adjusted the particle text effect animation parameters to give the words more time to form legibly before transitioning to the next word.

## Files Modified
- `public/js/particle-text-effect.js`

## Technical Details
- **Particle Speed:** Increased base `particle.maxSpeed` slightly from `Math.random() * 6 + 4` to `Math.random() * 8 + 6`. This helps the particles rush to their target destination slightly faster, reducing the time spent in the "messy" intermediate state.
- **Word Duration:** Changed the frame count interval condition from `frameCount % 240 === 0` (approx 4 seconds at 60fps) to `frameCount % 420 === 0` (approx 7 seconds). This ensures the text has enough time to be fully constructed and readable before "exploding" into the next phrase.
