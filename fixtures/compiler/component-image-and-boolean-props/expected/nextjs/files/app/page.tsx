import type { Metadata } from "next";
import PersonChip from "@/components/PersonChip";

export const metadata: Metadata = {
  title: "Home",
};

export default function HomePage() {
  return (
    <main className="body flex flex-col w-full h-fit">
      <ul className="people flex flex-col gap-4">
        <PersonChip className="ada flex" />
        <PersonChip
          className="grace flex"
          photo={{ src: "/assets/other-person.jpg", width: 512, height: 512 }}
          name="Grace Hopper"
          verified={false}
        />
        <PersonChip className="nobody flex" photo={null} name="No photo" />
      </ul>
    </main>
  );
}
