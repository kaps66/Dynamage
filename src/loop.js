/*
  loop.js (refactor tombstone)
  The large runtime logic was moved to ./src/loopInit.js to improve maintainability.
  Removed the initialization, animation loop and many helper functions from this file.
  See ./src/loopInit.js for the full implementation.
*/
import "./loopInit.js";
