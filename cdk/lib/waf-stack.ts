import * as cdk from 'aws-cdk-lib';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import { Construct } from 'constructs';

/**
 * WAF スタック（us-east-1 固定 — CloudFront 用 WAF の要件）
 *
 * CDK コンテキスト:
 *   - wafMode: 'ip' | 'captcha' (デフォルト: 'captcha')
 *       'ip'      → /admin/* への IP アドレス制限（許可 IP 以外はブロック）
 *       'captcha' → /admin/* へのアクセス時に CAPTCHA チャレンジ
 *   - allowedIPs: カンマ区切り CIDR リスト (例: "1.2.3.4/32,5.6.7.8/32")
 *       wafMode='ip' の場合のみ使用
 *
 * 出力:
 *   - WebAclArn: CloudFront に関連付ける WAF Web ACL ARN
 */
export class WafStack extends cdk.Stack {
  /** CloudFront に渡す WAF Web ACL ARN */
  public readonly webAclArn: string;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const wafMode = (this.node.tryGetContext('wafMode') as string) ?? 'captcha';
    const allowedIPsRaw = (this.node.tryGetContext('allowedIPs') as string) ?? '';
    const allowedIPs = allowedIPsRaw
      .split(',')
      .map((s: string) => s.trim())
      .filter(Boolean);

    const rules: wafv2.CfnWebACL.RuleProperty[] = [];

    if (wafMode === 'ip' && allowedIPs.length > 0) {
      // ============================================================
      // IP 制限モード: 許可 IP 以外からの /admin/* アクセスをブロック
      // ============================================================
      const ipSet = new wafv2.CfnIPSet(this, 'AdminAllowedIPSet', {
        name: 'homepage-admin-allowed-ips',
        scope: 'CLOUDFRONT',
        ipAddressVersion: 'IPV4',
        addresses: allowedIPs,
      });

      rules.push({
        name: 'AdminIPRestriction',
        priority: 1,
        // /admin/* にマッチ かつ 許可 IP でない → ブロック
        statement: {
          andStatement: {
            statements: [
              {
                byteMatchStatement: {
                  searchString: '/admin',
                  fieldToMatch: { uriPath: {} },
                  textTransformations: [{ priority: 0, type: 'NONE' }],
                  positionalConstraint: 'STARTS_WITH',
                },
              },
              {
                notStatement: {
                  statement: {
                    ipSetReferenceStatement: {
                      arn: ipSet.attrArn,
                    },
                  },
                },
              },
            ],
          },
        },
        action: { block: {} },
        visibilityConfig: {
          cloudWatchMetricsEnabled: true,
          metricName: 'AdminIPRestrictionRule',
          sampledRequestsEnabled: true,
        },
      });
    } else {
      // ============================================================
      // CAPTCHA モード: /admin/* へのアクセスに CAPTCHA チャレンジ
      // ============================================================
      rules.push({
        name: 'AdminCaptcha',
        priority: 1,
        statement: {
          byteMatchStatement: {
            searchString: '/admin',
            fieldToMatch: { uriPath: {} },
            textTransformations: [{ priority: 0, type: 'NONE' }],
            positionalConstraint: 'STARTS_WITH',
          },
        },
        action: { captcha: {} },
        visibilityConfig: {
          cloudWatchMetricsEnabled: true,
          metricName: 'AdminCaptchaRule',
          sampledRequestsEnabled: true,
        },
      });
    }

    const webAcl = new wafv2.CfnWebACL(this, 'AppWebAcl', {
      name: 'homepage-app-waf',
      scope: 'CLOUDFRONT',
      defaultAction: { allow: {} },
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: 'HomepageAppWAF',
        sampledRequestsEnabled: true,
      },
      rules,
    });

    this.webAclArn = webAcl.attrArn;

    new cdk.CfnOutput(this, 'WebAclArn', {
      value: this.webAclArn,
      description: 'WAF Web ACL ARN (InfraStack に --context wafAclArn で渡す)',
    });
  }
}
