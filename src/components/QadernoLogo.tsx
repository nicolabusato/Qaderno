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
          /* Zoomed lower-right quadrant of an editorial serif uppercase Q */
          <g>
            {/* Thick modulated lower-right bowl arc of uppercase Q */}
            <path
              d="M -6 14 C 6 40, 36 42, 46 14 C 50 2, 48 -10, 40 -18"
              className="stroke-[#1C1C1E] dark:stroke-[#F5F5F7]"
              strokeWidth="8.5"
              strokeLinecap="round"
              fill="none"
            />
            {/* Thin inner optical taper */}
            <path
              d="M 4 31 C 18 41, 35 37, 43 20"
              className="stroke-[#1C1C1E] dark:stroke-[#F5F5F7]"
              strokeWidth="2.5"
              strokeLinecap="round"
              fill="none"
            />
            {/* Signature sweeping lower-right diagonal tail of the Q */}
            <path
              d="M 27 32 C 36 37, 42 48, 55 51"
              className="stroke-[#1C1C1E] dark:stroke-[#F5F5F7]"
              strokeWidth="6.2"
              strokeLinecap="round"
              fill="none"
            />
            <circle cx="55.5" cy="50.8" r="2.6" className="fill-[#1C1C1E] dark:fill-[#F5F5F7]" />
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
            />
            <path
              d="M 32 36 C 39 40, 44 48, 52 50"
              className="stroke-[#1C1C1E] dark:stroke-[#F5F5F7]"
              strokeWidth="5.2"
              strokeLinecap="round"
            />
          </g>
        )}
      </g>
    </svg>
  );
};
