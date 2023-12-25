<div align="center">
  <img src="https://github.com/github.png" height="100px" width="100px" style="border-radius: 100%;" />
  <br />
  <h1>GitHub Config</h1>
  <p>GitHub Config for all <a href="https://github.com/xkrishguptaa">@xkrishguptaa</a> Repositories 🍭</p>
</div>

## ❓ Why `config-github`?

- It is hard to maintain consistency across all repositories
- This will sync all the repository settings
- It supports `labels`, `rulesets`, `webhooks` and more...

## 📦 Usage

The GitHub Action [sync.yml](https://github.com/xkrishguptaa/config-github/actions/workflows/sync.yml) will run every day and sync the repository settings with the config.

## ✨ Features

### Labels

- Finds labels from the config in `config/labels.json` and creates them if not found, else updates them. It will also delete the labels which are not in the config.
- It will also sync the colors of the labels.
- The key of the label for syncing is the `name` of the label.

### Disable Projects (if unused)

- If the repository has projects enabled, it will disable them if they are not used.

### Merge Strategies

- It will set the merge strategy to `squash` and `rebase` for the repository.
- Merge commits are not allowed.
- Auto-merge is enabled for the repository.
- Branches are deleted after merging.
- Web commit signing is required.

### Rulesets

- First, It will also delete all the rulesets.
- Then it will create the rulesets from the config in `config/rulesets.json`.

### Webhooks

- Webhooks are only `CREATED` and `UPDATED`.
- The key for syncing the webhooks is the `url` of the webhook.
- The config is in `config/webhooks.json`.

### Action Permissions

- It will set the permissions for the `actions` to `write` for the repositorys.
- It will allow the `actions` to access the approve pull requests.

### Readme

- It will check if the repository has a `README.md` file or not.
- If not, it will make a issue and ask the user to add a `README.md` file.

It will not create duplicate issues for the `README.md` file if the issue is already open and the title of the issue hasn't changed.

### License

- It will check if the repository has a `LICENSE` file or not.
- If not, it will make a issue and ask the user to add a `LICENSE` file.

It will not create duplicate issues for the `LICENSE` file if the issue is already open and the title of the issue hasn't changed.

## 📝 License

This project is licensed under the GNU-GPLv3.0+ license. Read the license file for more details
