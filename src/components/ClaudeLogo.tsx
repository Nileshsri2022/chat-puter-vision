export const ClaudeLogo = ({ className }: { className?: string }) => {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M12 2L2 7V17L12 22L22 17V7L12 2Z"
        fill="currentColor"
        opacity="0.2"
      />
      <path
        d="M12 2L2 7M12 2L22 7M12 2V12M2 7V17M2 7L12 12M22 7V17M22 7L12 12M2 17L12 22M2 17L12 12M22 17L12 22M22 17L12 12M12 12V22"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};
