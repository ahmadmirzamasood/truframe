type BadgeProps = {
  className: string;
};

export default function Badge(props: BadgeProps) {
  return (
    <div className={`badge px-2 py-1 rounded-[999px] ${props.className}`}>
      <span
        className="badge__badge-text tf-anim tf-load [--tf-opacity:0] [--tf-ease:ease-in]"
      >
        New
      </span>
    </div>
  );
}
