import React from 'react';

interface QadernoLogoProps {
  size?: number;
  className?: string;
  zoomedTail?: boolean;
}

/**
 * Sans Serif uppercase Q monogram with zoomed crop framing the lower-right curve & straight diagonal leg.
 */
export const QadernoLogo: React.FC<QadernoLogoProps> = ({
  size = 26,
  className = '',
  zoomedTail = true,
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <clipPath id="qaderno-icon-clip">
          <rect x="1.5" y="1.5" width="61" height="61" rx="15" />
        </clipPath>
      </defs>

      <rect
        x="1.5"
        y="1.5"
        width="61"
        height="61"
        rx="15"
        className="fill-[#FBFBFD] dark:fill-[#1E1E22] stroke-[#3C3C43]/18 dark:stroke-white/15"
        strokeWidth="1.5"
      />

      <g clipPath="url(#qaderno-icon-clip)">
        {/* Subtle grid accent inside logo */}
        <path
          d="M21 2V62M43 2V62M2 21H62M2 43H62"
          className="stroke-[#E5E5EA]/85 dark:stroke-white/8"
          strokeWidth="0.9"
        />

        {zoomedTail ? (
          /* Zoomed lower-right quadrant of a clean Sans Serif uppercase Q */
          <g>
            <ellipse
              cx="17"
              cy="11"
              rx="26"
              ry="28"
              className="stroke-[#1C1C1E] dark:stroke-[#F5F5F7]"
              strokeWidth="8"
              fill="none"
            />
            <line
              x1="26"
              y1="23"
              x2="52"
              y2="49"
              className="stroke-[#1C1C1E] dark:stroke-[#F5F5F7]"
              strokeWidth="7.2"
              strokeLinecap="butt"
            />
          </g>
        ) : (
          <g>
            <ellipse
              cx="30"
              cy="29"
              rx="15"
              ry="17"
              className="stroke-[#1C1C1E] dark:stroke-[#F5F5F7]"
              strokeWidth="5.2"
              fill="none"
            />
            <line
              x1="33"
              y1="34"
              x2="50"
              y2="51"
              className="stroke-[#1C1C1E] dark:stroke-[#F5F5F7]"
              strokeWidth="4.8"
              strokeLinecap="butt"
            />
          </g>
        )}
      </g>
    </svg>
  );
};
