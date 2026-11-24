import { Body } from "@react-email/body";
import { Container } from "@react-email/container";
import { Head } from "@react-email/head";
import { Heading } from "@react-email/heading";
import { Hr } from "@react-email/hr";
import { Html } from "@react-email/html";
import { Preview } from "@react-email/preview";
import { Text } from "@react-email/text";
import type { ReactNode } from "react";

const body = {
  backgroundColor: "#f6f6f7",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  margin: 0,
  padding: "32px 0",
};
const card = {
  backgroundColor: "#ffffff",
  borderRadius: "12px",
  maxWidth: "480px",
  margin: "0 auto",
  padding: "32px",
};
export const textStyle = { color: "#3f3f46", fontSize: "15px", lineHeight: "24px" };
export const buttonStyle = {
  backgroundColor: "#18181b",
  borderRadius: "8px",
  color: "#ffffff",
  display: "inline-block",
  fontSize: "15px",
  fontWeight: 600,
  padding: "12px 20px",
  textDecoration: "none",
};

export function Layout(props: { preview: string; heading: string; children: ReactNode }) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{props.preview}</Preview>
      <Body style={body}>
        <Container style={card}>
          <Text style={{ ...textStyle, fontWeight: 600, margin: "0 0 16px" }}>Truframe</Text>
          <Heading as="h1" style={{ color: "#18181b", fontSize: "22px", margin: "0 0 16px" }}>
            {props.heading}
          </Heading>
          {props.children}
          <Hr style={{ borderColor: "#e4e4e7", margin: "24px 0" }} />
          <Text style={{ ...textStyle, color: "#71717a", fontSize: "13px" }}>
            If you didn't ask for this email, you can ignore it. Nobody can use the link without
            access to your inbox.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
