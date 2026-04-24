import * as cdk from 'aws-cdk-lib';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import { Construct } from 'constructs';

/**
 * WAF スタック（us-east-1 固定 — CloudFront 用 WAF の要件）
 *
 * CDK コンテキスト:
 *   - wafMode: 'ip' | 'captcha' (デフォルト: 'captcha')
 *       'ip'      → /admin/* と /api/admin/* への IP アドレス制限（許可 IP 以外はブロック）
 *       'captcha' → /admin/* と /api/admin/* へのアクセス時に CAPTCHA チャレンジ
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
      // IP 制限モード: 許可 IP 以外からの /admin/* と /api/admin/* アクセスをブロック
      //
      // why: CloudFront は enableIpv6=true の場合 viewer が IPv6 で到達しうる。
      //      AWS WAF の IPSet は IPV4 / IPV6 で別々の IPSet を作る必要があるため、
      //      入力を `:` の有無で v4/v6 に振り分けて 2 つ作成し、OR 条件で併用する。
      //      どちらか片方しか指定されなかった場合でも動くように、存在するものだけ
      //      ルールに含める。
      // ============================================================
      const v4Addresses = allowedIPs.filter((ip) => !ip.includes(':'));
      const v6Addresses = allowedIPs.filter((ip) => ip.includes(':'));

      const ipSetRefs: wafv2.CfnWebACL.StatementProperty[] = [];

      if (v4Addresses.length > 0) {
        const ipSetV4 = new wafv2.CfnIPSet(this, 'AdminAllowedIPSet', {
          name: 'homepage-admin-allowed-ips',
          scope: 'CLOUDFRONT',
          ipAddressVersion: 'IPV4',
          addresses: v4Addresses,
        });
        ipSetRefs.push({
          ipSetReferenceStatement: { arn: ipSetV4.attrArn },
        });
      }

      if (v6Addresses.length > 0) {
        const ipSetV6 = new wafv2.CfnIPSet(this, 'AdminAllowedIPSetV6', {
          name: 'homepage-admin-allowed-ips-v6',
          scope: 'CLOUDFRONT',
          ipAddressVersion: 'IPV6',
          addresses: v6Addresses,
        });
        ipSetRefs.push({
          ipSetReferenceStatement: { arn: ipSetV6.attrArn },
        });
      }

      // v4/v6 いずれの IPSet にもマッチしない (= 許可外) なら Block
      const notInAnyIpSet: wafv2.CfnWebACL.StatementProperty =
        ipSetRefs.length === 1
          ? { notStatement: { statement: ipSetRefs[0] } }
          : {
              notStatement: {
                statement: { orStatement: { statements: ipSetRefs } },
              },
            };

      rules.push({
        name: 'AdminIPRestriction',
        priority: 1,
        // /admin/* または /api/admin/* にマッチ かつ 許可 IP でない → ブロック
        statement: {
          andStatement: {
            statements: [
              {
                orStatement: {
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
                      byteMatchStatement: {
                        searchString: '/api/admin',
                        fieldToMatch: { uriPath: {} },
                        textTransformations: [{ priority: 0, type: 'NONE' }],
                        positionalConstraint: 'STARTS_WITH',
                      },
                    },
                  ],
                },
              },
              notInAnyIpSet,
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
      // CAPTCHA モード: /admin/* と /api/admin/* へのアクセスに CAPTCHA チャレンジ
      // ============================================================
      rules.push({
        name: 'AdminCaptcha',
        priority: 1,
        statement: {
          orStatement: {
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
                byteMatchStatement: {
                  searchString: '/api/admin',
                  fieldToMatch: { uriPath: {} },
                  textTransformations: [{ priority: 0, type: 'NONE' }],
                  positionalConstraint: 'STARTS_WITH',
                },
              },
            ],
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
      // CAPTCHA を一度解いたらしばらく再チャレンジさせない設定。
      // 理由: 管理者が管理画面で作業する間に頻繁に CAPTCHA が出ると運用しづらいため、
      //       Immunity を 8 時間 (28800 秒) に延長する。これは CAPTCHA トークンの
      //       有効期間であり、攻撃者にとってはトークン取得後 8 時間しか攻撃できない
      //       =DoS リスクを大幅に下げつつ、正規管理者の UX を改善する。
      //       AWS デフォルトは 300 秒。上限は WAF 仕様上 259200 秒 (72h)。
      captchaConfig: {
        immunityTimeProperty: {
          immunityTime: 28800,
        },
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
