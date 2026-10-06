# ファン広場の投稿機能

Googleログイン後、テキスト投稿・返信・いいね・プロフィール登録・フォローが利用できます。投稿はFirebase Firestoreの`communityPosts`コレクションに保存され、最新50件がリアルタイムでファン広場に表示されます。プロフィールとユーザー名は`profiles`と`usernames`、いいねと返信は各投稿のサブコレクション、フォローは`profiles/{uid}/following`に保存されます。画像・動画アップロードはこの範囲に含まず、現在投稿できません。

トップページのおすすめ動画は、本人がログイン中にサイト内でクリックしたYouTube動画とお気に入り情報を`profiles/{uid}/videoSignals`へ保存し、タイトル中の語句が近い未視聴動画を表示します。リンク先YouTubeでの再生・視聴時間は取得しません。

## Firebaseでの有効化

1. Firebase Consoleでプロジェクト`kodako-web`のCloud Firestoreデータベースを作成します。
2. Firebase CLIを使い、プロジェクトのルートで以下を実行してルールを公開します。

   ```text
   firebase deploy --only firestore:rules
   ```

   このリポジトリの`firebase.json`が`firestore.rules`をデプロイします。

3. Firebase AuthenticationでGoogleプロバイダを有効化し、GitHub Pagesのドメインを承認済みドメインに追加します。

Firestoreルールでは、プロフィールのユーザー名予約を含むトランザクション、投稿・返信の作成、本人による「いいね」・フォロー・おすすめ履歴の保存を認証ユーザーに限定します。投稿、プロフィール、いいね数、返信は公開で読み取り可能ですが、おすすめ履歴は本人のみ読み取れます。コメントや自己紹介に個人の連絡先を含めないようにしてください。ルールを変更した後は、Firebase ConsoleまたはFirebase CLIで必ず公開してください。

GitHub Pagesへのファイル公開だけではFirestoreルールは更新されません。ルールをまだ公開していない場合、ログイン後も読み込み・保存が`permission-denied`になります。Firebase ConsoleのFirestore Database → Rulesに`firestore.rules`の内容を公開するか、Firebase CLIで上記コマンドを実行してください。
