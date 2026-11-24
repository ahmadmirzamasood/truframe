type PricingCardProps = {
  className: string;
  title?: string;
  price?: string;
};

export default function PricingCard(props: PricingCardProps) {
  return (
    <article
      className={`pricing-card flex-col gap-2 p-6 border border-[#e4e4e7] rounded-2xl ${props.className}`}
    >
      <h3 className="pricing-card__title text-xl font-semibold">
        {props.title ?? "Starter"}
      </h3>
      <p className="pricing-card__price text-4xl font-bold">
        {props.price ?? "$0"}
      </p>
    </article>
  );
}
