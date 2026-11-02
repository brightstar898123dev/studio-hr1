import type { TemplateType } from "@/lib/types";

/**
 * Built-in default templates, used when HR has not saved a custom one.
 * The HTML follows email-client rules: tables for layout, inline CSS,
 * 600px max width, no external CSS, no scripts. Tested patterns for Gmail,
 * Outlook (including the VML-free "bulletproof" button) and phones.
 */

export const DEFAULT_SUBJECT_TEMPLATE = "{{subject}}";

export const DEFAULT_HTML_TEMPLATE = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<title>{{company_name}}</title>
<style>
  @media only screen and (max-width: 620px) {
    .container { width: 100% !important; }
    .px { padding-left: 20px !important; padding-right: 20px !important; }
    .btn a { display: block !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;-webkit-text-size-adjust:100%;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f3f4f6;">
  <tr>
    <td align="center" style="padding:24px 12px;">
      <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background-color:#ffffff;border-radius:12px;overflow:hidden;">
        <tr>
          <td class="px" align="left" bgcolor="{{brand_color}}" style="background-color:{{brand_color}};padding:24px 40px;">
            {{#logo_url}}<img src="{{logo_url}}" alt="{{company_name}}" height="36" style="display:block;height:36px;max-height:36px;width:auto;border:0;outline:none;text-decoration:none;">{{/logo_url}}
            {{^logo_url}}<span style="font-family:Arial,Helvetica,sans-serif;font-size:20px;font-weight:bold;color:#ffffff;">{{company_name}}</span>{{/logo_url}}
          </td>
        </tr>
        <tr>
          <td class="px" style="padding:32px 40px 8px 40px;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
            {{body}}
          </td>
        </tr>
        {{#interview_link}}
        <tr>
          <td class="px" align="center" style="padding:8px 40px 24px 40px;font-family:Arial,Helvetica,sans-serif;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" class="btn">
              <tr>
                <td align="center" bgcolor="{{brand_color}}" style="border-radius:8px;background-color:{{brand_color}};">
                  <a href="{{interview_link}}" target="_blank" style="display:inline-block;padding:14px 32px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:8px;">Start your interview</a>
                </td>
              </tr>
            </table>
            <p style="margin:16px 0 0 0;font-size:13px;line-height:1.5;color:#6b7280;">If the button does not work, copy this link into your browser:<br><a href="{{interview_link}}" target="_blank" style="color:{{brand_color}};word-break:break-all;">{{interview_link}}</a></p>
          </td>
        </tr>
        {{/interview_link}}
        <tr>
          <td class="px" style="padding:8px 40px 32px 40px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#1f2937;">
            {{signature}}
          </td>
        </tr>
        <tr>
          <td class="px" style="padding:20px 40px;background-color:#f9fafb;border-top:1px solid #e5e7eb;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#6b7280;">
            {{company_name}}<br>
            {{unsubscribe_text}}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

export const DEFAULT_TEXT_TEMPLATE = `{{body}}
{{#interview_link}}
Start your interview here:
{{interview_link}}
{{/interview_link}}
{{signature}}

--
{{company_name}}
{{unsubscribe_text}}`;

/** Digest emails go to HR, not candidates: no button, no unsubscribe line. */
export const DEFAULT_DIGEST_HTML_TEMPLATE = DEFAULT_HTML_TEMPLATE.replace(
  /\{\{#interview_link\}\}[\s\S]*?\{\{\/interview_link\}\}/,
  "",
).replace("{{company_name}}<br>\n            {{unsubscribe_text}}", "Sent automatically by your HR recruiting app.");

export function builtInTemplate(type: TemplateType) {
  return {
    format: "html" as const,
    subject_template: DEFAULT_SUBJECT_TEMPLATE,
    body_template: type === "digest" ? DEFAULT_DIGEST_HTML_TEMPLATE : DEFAULT_HTML_TEMPLATE,
  };
}
