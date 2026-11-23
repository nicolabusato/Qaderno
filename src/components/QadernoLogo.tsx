import React from 'react';

interface QadernoLogoProps {
  size?: number;
  className?: string;
  zoomedTail?: boolean;
}

/**
 * Editorial uppercase Q monogram with zoomed crop framing the lower-right curve & calligraphic tail.
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
          /* Zoomed lower-right quadrant of editorial uppercase Q (bump-free inner curve) */
          <g>
            <path
              d="M -3 16 C 6 39.5, 35.75 41.5, 46 14"
              className="stroke-[#1C1C1E] dark:stroke-[#F5F5F7]"
              strokeWidth="8.25"
              strokeLinecap="round"
              fill="none"
            />
            <path
              d="M 28.5 34.25 C 36.5 39, 42.25 48.25, 55.25 51"
              className="stroke-[#1C1C1E] dark:stroke-[#F5F5F7]"
              strokeWidth="6"
              strokeLinecap="round"
              fill="none"
            />
          </g>
        ) : (
          /* Shrunken centered uppercase Q for compact contexts */
          <g>
            <path
              d="M 2.125 17.75 C 8.25 37, 33.5 38.5, 43 17.5"
              className="stroke-[#1C1C1E] dark:stroke-[#F5F5F7]"
              strokeWidth="6.75"
              strokeLinecap="round"
              fill="none"
            />
            <path
              d="M 28.125 33.5 C 35.125 38, 41 44.75, 49.875 47.375"
              className="stroke-[#1C1C1E] dark:stroke-[#F5F5F7]"
              strokeWidth="5"
              strokeLinecap="round"
              fill="none"
            />
          </g>
        )}
      </g>
    </svg>
  );
};
