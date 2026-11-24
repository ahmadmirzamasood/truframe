type FeatureProps = {
  className: string;
  emphasis?: "normal" | "strong";
  heading?: string;
};

const featureVariants: Partial<Record<string, string>> = {
  "emphasis=strong": "feature flex-col gap-2 p-4 bg-[#fef3c7] rounded-xl",
};

export default function Feature(props: FeatureProps) {
  const variant = `emphasis=${props.emphasis ?? "normal"}`;
  return (
    <div
      className={`${featureVariants[variant] ?? "feature flex-col gap-2 p-4"} ${props.className}`}
    >
      <div
        className="feature__icon flex-none w-10 h-10 bg-[#e5e5e5]"
        aria-hidden="true"
      />
      <h3 className="feature__heading text-xl font-semibold">
        {props.heading ?? "Feature"}
      </h3>
      <p className="feature__body text-[#52525b]">Describe the feature.</p>
    </div>
  );
}
