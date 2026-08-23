export function Mascot({
  className,
  alt = "",
}: {
  className?: string;
  alt?: string;
}) {
  return (
    <div className={className ? `m-mascot ${className}` : "m-mascot"}>
      <img src="/brand/mascot.jpg" alt={alt} />
      <span className="m-mascot-visor" aria-hidden>
        <span className="m-mascot-eye" />
        <span className="m-mascot-eye" />
      </span>
    </div>
  );
}
