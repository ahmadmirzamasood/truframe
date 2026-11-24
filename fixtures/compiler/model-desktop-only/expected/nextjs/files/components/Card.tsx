type CardProps = {
  className: string;
  size?: "default" | "large";
  title?: string;
};

const cardVariants: Partial<Record<string, string>> = {
  "size=large": "card p-8",
};

export default function Card(props: CardProps) {
  const variant = `size=${props.size ?? "default"}`;
  return (
    <div className={`${cardVariants[variant] ?? "card"} ${props.className}`}>
      <h3 className="card__title">{props.title ?? "Title"}</h3>
    </div>
  );
}
