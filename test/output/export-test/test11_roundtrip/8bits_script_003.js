const svgElement = document.currentScript.ownerSVGElement; // Automatically target the containing SVG element

    if (svgElement) {
        // A mapping for active pointers (for multi-touch scenarios or pointer events)
        const activePointers = new Map();

        function normalizeEvent(e) {
            let clientX = 0;
            let clientY = 0;
            let isTouch = false;

            if (e.touches && e.touches.length > 0) {
                clientX = e.touches[0].clientX;
                clientY = e.touches[0].clientY;
                isTouch = true;
            } else if (e.changedTouches && e.changedTouches.length > 0) {
                clientX = e.changedTouches[0].clientX;
                clientY = e.changedTouches[0].clientY;
                isTouch = true;
            } else {
                clientX = e.clientX;
                clientY = e.clientY;
                isTouch = (e.pointerType === 'touch' || e.pointerType === 'pen');
            }

            return {
                originalEvent: e,
                clientX: clientX,
                clientY: clientY,
                target: e.target,
                isTouch: isTouch,
                pointerId: e.pointerId || (isTouch ? 'touch' : 'mouse') // Simple ID for tracking
            };
        }

        function handleStart(e) {
            e.preventDefault(); // Prevent default browser touch actions (e.g., scrolling)
            const normalized = normalizeEvent(e);
            activePointers.set(normalized.pointerId, normalized);

            const customEvent = new CustomEvent('svg:interactstart', {
                bubbles: true,
                cancelable: true,
                detail: normalized
            });
            svgElement.dispatchEvent(customEvent);
        }

        function handleMove(e) {
            const normalized = normalizeEvent(e);
            if (!activePointers.has(normalized.pointerId)) return; // Only track active pointers

            const customEvent = new CustomEvent('svg:interactmove', {
                bubbles: true,
                cancelable: true,
                detail: normalized
            });
            svgElement.dispatchEvent(customEvent);
        }

        function handleEnd(e) {
            const normalized = normalizeEvent(e);
            if (!activePointers.has(normalized.pointerId)) return; // Only track active pointers
            activePointers.delete(normalized.pointerId);

            const customEvent = new CustomEvent('svg:interactend', {
                bubbles: true,
                cancelable: true,
                detail: normalized
            });
            svgElement.dispatchEvent(customEvent);
        }

        // Feature detection and event listener attachment
        if (window.PointerEvent) {
            // Use Pointer Events for unified input if available
            svgElement.addEventListener('pointerdown', handleStart);
            svgElement.addEventListener('pointermove', handleMove);
            svgElement.addEventListener('pointerup', handleEnd);
            svgElement.addEventListener('pointercancel', handleEnd); // Handle cancelled pointers
        } else {
            // Fallback to touch and mouse events
            // Touch events for mobile
            svgElement.addEventListener('touchstart', handleStart);
            svgElement.addEventListener('touchmove', handleMove);
            svgElement.addEventListener('touchend', handleEnd);
            svgElement.addEventListener('touchcancel', handleEnd);

            // Mouse events for desktop (only if no touch/pointer events are used)
            svgElement.addEventListener('mousedown', handleStart);
            svgElement.addEventListener('mousemove', handleMove);
            svgElement.addEventListener('mouseup', handleEnd);
            // Mouseout can act as a mouseup if dragged off the element
            svgElement.addEventListener('mouseout', handleEnd);
        }
    } else {
        // This warning should rarely appear if the script is properly embedded within an SVG.
        console.warn("Containing SVG element not found via document.currentScript.ownerSVGElement.");
    }