# ファン広場の投稿機能

Googleログイン後、テキスト投稿、返信・いいね・プロフィール登録・フォローが利用できます。プロフィール設定ではGoogleアカウント画像か用意されたアイコンを選べます。Firestoreには画像ファイルではなく小さなアイコンIDを保存するため、Firebase Storageや有料のファイル保存枠は使いません。選択アイコンは新しい投稿・返信にも表示されます。プロフィール設定には自分の投稿・返信履歴が表示されます。いいね・返信・フォローは受け取った人の設定ページにサイト内通知として保存され、通知設定で種類ごとに表示・非表示を切り替えられます（メール・プッシュ通知ではありません）。画像・動画投稿は有料ストレージの利用を避けるため停止しており、投稿フォームから支援先ポップアップを表示します。Amazonほしい物リストと公式SUZURIショップへのリンクを提供します。投稿はFirestoreの`communityPosts`、プロフィールとユーザー名は`profiles`と`usernames`、いいねと返信は各投稿のサブコレクション、フォロー・通知・通知設定は`profiles/{uid}`以下に保存されます。ファン広場は最新30件を表示し、返信は各投稿に最新3件を常時表示します。

トップページではログイン中に最新動画からお気に入りを選べます。選択内容とサイト内動画リンクのクリック情報は`profiles/{uid}/videoSignals`へ保存され、お気に入り動画やクリックした動画のタイトルと近い未視聴動画をおすすめします。リンク先YouTubeでの再生・視聴時間は取得しません。

## Firebaseでの有効化

1. Firebase Consoleでプロジェクト`kodako-web`のCloud Firestoreデータベースを作成します。
2. Firebase CLIを使い、プロジェクトのルートで以下を実行してFirestoreとStorageのルールを公開します。Storageルールは不要な読み書きを防ぐため全パスを拒否します。

   ```text
   firebase deploy --only firestore:rules,storage
   ```

   このリポジトリの`firebase.json`が`firestore.rules`と`storage.rules`をデプロイします。Storage未設定でコマンド全体が失敗する場合は、`firebase deploy --only firestore:rules`でFirestoreルールを公開してください。

3. Firebase AuthenticationでGoogleプロバイダを有効化し、GitHub Pagesのドメインを承認済みドメインに追加します。

Firestoreルールでは、プロフィールのユーザー名予約を含むトランザクション、テキスト投稿・返信の作成、本人による「いいね」・フォロー・おすすめ履歴・通知設定の保存、宛先と元イベントが一致する通知の作成を認証ユーザーに限定します。通知とおすすめ履歴、通知設定は本人のみ読み取れます。Storageルールでは読み書きをすべて拒否します。投稿・プロフィール・いいね数・返信は公開で読み取り可能です。コメントや自己紹介に個人の連絡先を含めないでください。ルールを変更した後は、Firebase ConsoleまたはFirebase CLIで必ず公開してください。

GitHub Pagesへのファイル公開だけではFirestore/Storageルールは更新されません。ルールをまだ公開していない場合、ログイン後も読み込み・保存が`permission-denied`になります。Firebase ConsoleのFirestore Database → Rulesへ`firestore.rules`、Storage → Rulesへ`storage.rules`をそれぞれ公開するか、Firebase CLIで上記コマンドを実行してください。投げ銭を有効化するには、PayPayやPayPalなどの決済アカウントを作成し、支払いリンクを別途設定する必要があります。
