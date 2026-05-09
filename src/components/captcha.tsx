import HCaptcha from "@hcaptcha/react-hcaptcha";
import { useRef } from "react";

export function Captcha({ siteKey, onVerify }: { siteKey: string | null | undefined; onVerify: (token: string | null) => void }) {
  const ref = useRef<HCaptcha>(null);
  if (!siteKey) return null;
  return (
    <div className="flex justify-center">
      <HCaptcha
        ref={ref}
        sitekey={siteKey}
        onVerify={(t) => onVerify(t)}
        onExpire={() => onVerify(null)}
        onError={() => onVerify(null)}
        theme="dark"
      />
    </div>
  );
}
