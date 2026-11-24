import type { Metadata } from "next";
import Button from "@/components/Button";

export const metadata: Metadata = {
  title: "Home",
};

export default function HomePage() {
  return (
    <main className="body flex flex-col w-full h-fit">
      <div className="buttons flex items-center gap-3">
        <Button className="default flex" />
        <Button className="small flex" size="small" label="Small" />
        <Button
          className="large flex"
          size="large"
          label="Get started"
          href="/signup"
        />
        <Button
          className="light flex"
          tone="light"
          label="Learn more"
          href="https://example.com"
        />
      </div>
    </main>
  );
}
