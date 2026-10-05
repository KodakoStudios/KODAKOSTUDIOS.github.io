# ファン広場の投稿機能

現在利用できる投稿は、Googleログイン後のテキストコメントです。投稿はFirebase Firestoreの`communityPosts`コレクションに保存され、最新50件がファン広場に表示されます。ファンアート・動画のアップロードは別途Firebase Storageとサーバー側のアクセス制御が必要なため、まだ投稿できません。

## Firebaseでの有効化

1. Firebase Consoleでプロジェクト`kodako-web`のCloud Firestoreデータベースを作成します。
2. Firebase CLIを使い、プロジェクトのルートで以下を実行してルールを公開します。

   ```text
   firebase deploy --only firestore:rules
   ```

   このリポジトリの`firebase.json`が`firestore.rules`をデプロイします。

3. Firebase AuthenticationでGoogleプロバイダを有効化し、GitHub Pagesのドメインを承認済みドメインに追加します。

Firestoreルールでは、投稿の作成をログインユーザーに限定し、投稿者ID・表示名・本文・AI利用タグ・サーバー時刻を検証します。投稿一覧は公開で読み取り可能です。コメントには個人の連絡先を含めないようにしてください。
