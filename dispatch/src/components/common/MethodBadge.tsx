
import { getMethodHexColor } from "../../constants/httpConstants";

interface MethodBadgeProps {
  method: string;
  compact?: boolean;
}

/**
 * Compact HTTP method label with color coding.
 * Used in sidebar items, tabs, and history entries.
 */
export const MethodBadge: React.FC<MethodBadgeProps> = ({ method, compact = false }) => (
  <span 
    className={`${compact ? "text-[10px]" : "w-[52px] text-[11px]"} shrink-0 font-bold tracking-wider`}
    style={{ color: getMethodHexColor(method) }}
  >
    {method.toUpperCase()}
  </span>
);
