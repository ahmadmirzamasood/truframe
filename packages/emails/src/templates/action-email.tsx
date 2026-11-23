import { Button } from "@react-email/button";
import { Link } from "@react-email/link";
import { Text } from "@react-email/text";
import { buttonStyle, Layout, textStyle } from "./layout.tsx";

/** One call to action: verify email, magic link, password reset. */
export function ActionEmail(props: {
  preview: string;
  heading: string;
  intro: string;
  action: string;
  url: string;
  expiry: string;
}) {
  return (
    <Layout preview={props.preview} heading={props.heading}>
      <Text style={textStyle}>{props.intro}</Text>
      <Button href={props.url} style={buttonStyle}>
        {props.action}
      </Button>
      <Text style={textStyle}>This link expires in {props.expiry}.</Text>
      <Text style={{ ...textStyle, fontSize: "13px", wordBreak: "break-all" }}>
        Or paste this address into your browser: <Link href={props.url}>{props.url}</Link>
      </Text>
    </Layout>
  );
}
