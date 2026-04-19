"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

interface CognitoUser {
  username: string;
  email: string;
  status: string;
  enabled: boolean;
  createdAt: string;
  mfaEnabled: boolean;
}

interface Props {
  completed?: boolean;
}

export function Step1aCognitoUser({ completed }: Props) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ message: string } | null>(null);
  const [cognitoDomain, setCognitoDomain] = useState("");
  const [cognitoClientId, setCognitoClientId] = useState("");
  const [cognitoRegion, setCognitoRegion] = useState("ap-northeast-1");
  const [users, setUsers] = useState<CognitoUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/cognito-users");
      const data = await res.json();
      if (data.users) setUsers(data.users);
    } catch {
      // ignore
    } finally {
      setUsersLoading(false);
    }
  }, []);

  // Cognito 情報 + ユーザー一覧を取得
  useEffect(() => {
    fetch("/api/cognito-info")
      .then((res) => res.json())
      .then((data) => {
        if (data.domain) setCognitoDomain(data.domain);
        if (data.clientId) setCognitoClientId(data.clientId);
        if (data.region) setCognitoRegion(data.region);
      })
      .catch(() => {});

    fetchUsers();
  }, [fetchUsers]);

  const hasUsers = users.length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("パスワードが一致しません");
      return;
    }

    // 重複チェック
    if (users.some((u) => u.email === email)) {
      setError(`${email} は既に作成済みです`);
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/cognito-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error);
        return;
      }

      setResult(data);
      setEmail("");
      setPassword("");
      setConfirmPassword("");
      // ユーザー一覧を再取得
      await fetchUsers();
    } catch {
      setError("リクエストに失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const hostedUiUrl =
    cognitoDomain && cognitoClientId
      ? `https://${cognitoDomain}.auth.${cognitoRegion}.amazoncognito.com/login?client_id=${cognitoClientId}&response_type=code&scope=openid+email&redirect_uri=http://localhost:3000/admin`
      : "";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-800">
          Step 1a — 管理者ユーザーの作成
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          管理画面にログインするための Cognito ユーザーを作成します。
        </p>
      </div>

      {/* ───── 作成済みユーザー一覧 ───── */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
          <h3 className="text-sm font-medium text-gray-700">
            作成済みユーザー
          </h3>
        </div>
        {usersLoading ? (
          <div className="px-4 py-3 text-sm text-gray-500">読み込み中...</div>
        ) : users.length === 0 ? (
          <div className="px-4 py-3 text-sm text-gray-500">
            ユーザーはまだ作成されていません
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-gray-600">
                <th className="px-4 py-2 font-medium">メールアドレス</th>
                <th className="px-4 py-2 font-medium">ステータス</th>
                <th className="px-4 py-2 font-medium">作成日時</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr
                  key={u.username}
                  className="border-b border-gray-50 last:border-0"
                >
                  <td className="px-4 py-2 text-gray-800">{u.email}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        u.status === "CONFIRMED"
                          ? "bg-green-100 text-green-800"
                          : "bg-yellow-100 text-yellow-800"
                      }`}
                    >
                      {u.status === "CONFIRMED" ? "確認済み" : u.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-gray-500">
                    {u.createdAt
                      ? new Date(u.createdAt).toLocaleString("ja-JP")
                      : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ───── 2FA 設定案内（ユーザー作成済みの場合） ───── */}
      {hasUsers && hostedUiUrl && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm">
          <div className="flex items-start gap-3">
            <span className="text-xl mt-0.5">🔐</span>
            <div className="space-y-2">
              <p className="font-semibold text-amber-900">
                次のステップ: 2段階認証（2FA）の設定
              </p>
              <p className="text-amber-800">
                管理画面へのログインには 2段階認証が必須です。
                以下のボタンから Cognito ログイン画面を開き、作成したユーザーでログインしてください。
              </p>
              <div className="bg-amber-100 rounded p-3 space-y-1">
                <p className="font-medium text-amber-900">設定手順:</p>
                <ol className="list-decimal list-inside text-amber-800 space-y-1">
                  <li>下のボタンをクリックしてログイン画面を開く</li>
                  <li>上で作成したメールアドレスとパスワードでログイン</li>
                  <li>QR コードが表示されるので、認証アプリ（Google Authenticator 等）でスキャン</li>
                  <li>認証アプリに表示される 6桁のコードを入力して完了</li>
                </ol>
              </div>
              <div className="bg-red-100 border border-red-300 rounded p-3 space-y-1">
                <p className="font-semibold text-red-800">⚠ ログイン成功後のエラー画面について</p>
                <p className="text-red-700">
                  2FA の設定が完了すると、自動的に
                  <code className="bg-red-200 px-1 rounded text-xs">http://localhost:3000/admin?code=...</code>
                  に移動し、<strong>接続エラー（ページが表示できない）</strong>が表示されます。
                </p>
                <p className="text-red-700 font-medium">
                  → これは正常な動作です。homepage 本体がまだ起動していないために起こるエラーなので、
                  そのままブラウザのタブを閉じてください。
                </p>
                <p className="text-red-700 text-xs">
                  ※ 2FA の設定自体は完了しています。このエラーは無視して問題ありません。
                </p>
              </div>
              <a
                href={hostedUiUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-700 transition-colors"
              >
                Cognito ログイン画面を開く
                <span className="text-xs">↗</span>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* ───── ユーザー作成フォーム ───── */}
      {!completed && (
        <>
          <div className="border-t border-gray-200 pt-4">
            <h3 className="text-sm font-medium text-gray-700 mb-3">
              {hasUsers ? "追加ユーザーの作成" : "管理者ユーザーの作成"}
            </h3>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                メールアドレス
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@example.com"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                パスワード（8文字以上）
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                パスワード（確認）
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
                {error}
              </div>
            )}

            {result && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm text-green-800">
                <p className="font-medium">✓ {result.message}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "作成中..." : "管理者ユーザーを作成"}
            </button>
          </form>
        </>
      )}

      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-600">
        <p className="font-medium text-gray-700">Phase 1a 完了条件</p>
        <ul className="mt-2 list-disc list-inside space-y-1">
          <li>管理者ユーザーが Cognito に作成済み</li>
          <li>TOTP（2FA）の設定が完了</li>
          <li>Hosted UI からログインできることを確認</li>
        </ul>
      </div>
    </div>
  );
}
