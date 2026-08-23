import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type HTMLAttributes,
} from "react";

type ScrollAxis = "vertical" | "horizontal" | "both";

interface OverlayScrollAreaProps extends HTMLAttributes<HTMLDivElement> {
  containerClassName?: string;
  axis?: ScrollAxis;
  horizontalThumbBottom?: number;
}

interface ThumbMetrics {
  position: number;
  size: number;
  visible: boolean;
}

const HIDDEN_THUMB: ThumbMetrics = { position: 0, size: 0, visible: false };
const MIN_THUMB_SIZE = 36;

function calculateThumb(viewportSize: number, contentSize: number, scrollPosition: number): ThumbMetrics {
  if (contentSize <= viewportSize + 1) return HIDDEN_THUMB;

  const size = Math.max(MIN_THUMB_SIZE, (viewportSize / contentSize) * viewportSize);
  const maximumPosition = viewportSize - size;
  const maximumScroll = contentSize - viewportSize;
  return {
    position: maximumScroll > 0 ? (scrollPosition / maximumScroll) * maximumPosition : 0,
    size,
    visible: true,
  };
}

function metricsMatch(left: ThumbMetrics, right: ThumbMetrics) {
  return left.visible === right.visible
    && Math.abs(left.position - right.position) < 0.5
    && Math.abs(left.size - right.size) < 0.5;
}

/** Uses the same slim, layout-neutral overlay scrollbar as the collections tree. */
export const OverlayScrollArea = forwardRef<HTMLDivElement, OverlayScrollAreaProps>(
  ({
    containerClassName = "",
    className = "",
    axis = "both",
    horizontalThumbBottom = 4,
    onScroll,
    children,
    ...props
  }, forwardedRef) => {
    const viewportRef = useRef<HTMLDivElement>(null);
    const [verticalThumb, setVerticalThumb] = useState<ThumbMetrics>(HIDDEN_THUMB);
    const [horizontalThumb, setHorizontalThumb] = useState<ThumbMetrics>(HIDDEN_THUMB);

    useImperativeHandle(forwardedRef, () => viewportRef.current as HTMLDivElement);

    const updateThumbs = useCallback(() => {
      const viewport = viewportRef.current;
      if (!viewport) return;

      const nextVertical = calculateThumb(viewport.clientHeight, viewport.scrollHeight, viewport.scrollTop);
      const nextHorizontal = calculateThumb(viewport.clientWidth, viewport.scrollWidth, viewport.scrollLeft);
      setVerticalThumb((current) => metricsMatch(current, nextVertical) ? current : nextVertical);
      setHorizontalThumb((current) => metricsMatch(current, nextHorizontal) ? current : nextHorizontal);
    }, []);

    useEffect(() => {
      const viewport = viewportRef.current;
      if (!viewport) return;

      const frame = requestAnimationFrame(updateThumbs);
      const resizeObserver = new ResizeObserver(updateThumbs);
      const mutationObserver = new MutationObserver(() => requestAnimationFrame(updateThumbs));
      resizeObserver.observe(viewport);
      mutationObserver.observe(viewport, { childList: true, subtree: true, characterData: true });

      return () => {
        cancelAnimationFrame(frame);
        resizeObserver.disconnect();
        mutationObserver.disconnect();
      };
    }, [updateThumbs]);

    return (
      <div className={`relative min-h-0 min-w-0 overflow-hidden ${containerClassName}`}>
        <div
          {...props}
          ref={viewportRef}
          onScroll={(event) => {
            updateThumbs();
            onScroll?.(event);
          }}
          className={`overlay-scroll-viewport h-full w-full ${className}`}
        >
          {children}
        </div>

        {(axis === "vertical" || axis === "both") && verticalThumb.visible && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute right-1 top-0 z-40 w-1 rounded-full bg-[#4a4a4a]"
            style={{ height: verticalThumb.size, transform: `translateY(${verticalThumb.position}px)` }}
          />
        )}
        {(axis === "horizontal" || axis === "both") && horizontalThumb.visible && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-0 z-40 h-1 rounded-full bg-[#4a4a4a]"
            style={{
              bottom: horizontalThumbBottom,
              width: horizontalThumb.size,
              transform: `translateX(${horizontalThumb.position}px)`,
            }}
          />
        )}
      </div>
    );
  }
);

OverlayScrollArea.displayName = "OverlayScrollArea";
