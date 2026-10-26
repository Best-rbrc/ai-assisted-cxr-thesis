/**
 * CheXIcon - custom chest X-ray / lung icon for the study app.
 *
 * Design: stylized trachea + two lung silhouettes, evoking a chest X-ray
 * at any size. Uses `currentColor` so it inherits Tailwind text-* classes.
 */
const CheXIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    {/* Trachea */}
    <path
      d="M12 3.5V8"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
    {/* Carina branches */}
    <path
      d="M12 8L9 9.5M12 8L15 9.5"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
    {/* Left lung */}
    <path
      d="M9 9.5C8.2 9.8 5.8 11 5.5 13.5C5.1 16.5 6 19.5 8 20.5C9 21 10.5 20.5 10.5 19V11C10.5 10 9.8 9.2 9 9.5Z"
      fill="currentColor"
      opacity="0.9"
    />
    {/* Right lung */}
    <path
      d="M15 9.5C15.8 9.8 18.2 11 18.5 13.5C18.9 16.5 18 19.5 16 20.5C15 21 13.5 20.5 13.5 19V11C13.5 10 14.2 9.2 15 9.5Z"
      fill="currentColor"
      opacity="0.9"
    />
  </svg>
);

export default CheXIcon;
