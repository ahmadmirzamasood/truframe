import Link from "next/link";

type ButtonProps = {
  className: string;
  size?: "small" | "default" | "large";
  tone?: "dark" | "light";
  label?: string;
  href?: string;
};

const buttonVariants: Partial<Record<string, string>> = {
  "size=default,tone=light":
    "button items-center px-4 py-2.5 text-[#18181b] bg-[#ffffff] border border-[#e4e4e7] rounded-lg",
  "size=large,tone=dark":
    "button items-center px-6 py-3.5 text-[#ffffff] bg-[#18181b] rounded-lg",
  "size=small,tone=dark":
    "button items-center px-3 py-1.5 text-[#ffffff] bg-[#18181b] rounded-md",
};

const buttonLabelVariants: Partial<Record<string, string>> = {
  "size=large,tone=dark": "button__label text-lg font-semibold",
  "size=small,tone=dark": "button__label text-sm font-semibold",
};

export default function Button(props: ButtonProps) {
  const variant = `size=${props.size ?? "default"},tone=${props.tone ?? "dark"}`;
  return (
    <Link
      href={props.href ?? "#"}
      className={`${buttonVariants[variant] ?? "button items-center px-4 py-2.5 text-[#ffffff] bg-[#18181b] rounded-lg"} ${props.className}`}
    >
      <span
        className={buttonLabelVariants[variant] ?? "button__label font-semibold"}
      >
        {props.label ?? "Click me"}
      </span>
    </Link>
  );
}
