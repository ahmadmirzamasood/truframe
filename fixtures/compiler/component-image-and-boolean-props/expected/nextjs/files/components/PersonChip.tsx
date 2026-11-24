import Image from "next/image";

type PersonChipProps = {
  className: string;
  photo?: { src: string; width: number; height: number } | null;
  name?: string;
  verified?: boolean;
};

export default function PersonChip(props: PersonChipProps) {
  const photoImage =
    props.photo !== undefined
      ? props.photo
      : { src: "/assets/avatar.png", width: 256, height: 256 };
  return (
    <div className={`person-chip items-center gap-3 ${props.className}`}>
      {photoImage && (
        <Image
          src={photoImage.src}
          alt=""
          width={photoImage.width}
          height={photoImage.height}
          className="person-chip__photo flex-none w-16 h-16 rounded-full object-cover"
        />
      )}
      <p className="person-chip__name font-semibold">
        {props.name ?? "Ada Lovelace"}
      </p>
      {(props.verified ?? true) && (
        <span className="person-chip__badge text-xs text-[#16a34a]">
          Verified
        </span>
      )}
    </div>
  );
}
