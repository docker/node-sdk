import * as fs from 'fs';
import { Octokit } from '@octokit/rest';
const { request } = require('@octokit/request');

const download = async () => {
  const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN,
  });

  const asdf = new Octokit();

  const latestReleases = await octokit.repos.listReleases({
    owner: 'docker',
    repo: 'api',
    page: 1,
    per_page: 1,
  });

  if (latestReleases.data.length !== 1) {
    throw new Error('Found more than one release');
  }

  const latestRelease = latestReleases.data[0];

  const linuxAsset = latestRelease.assets.find(
    (asset) => asset.name == 'docker-linux-amd64'
  );

  if (!linuxAsset) {
    throw new Error('linux asset not found');
  }

  const options = asdf.repos.getReleaseAsset.endpoint.merge({
    headers: {
      Accept: 'application/octet-stream',
    },
    owner: 'docker',
    repo: 'api',
    asset_id: linuxAsset.id,
    access_token: process.env.GITHUB_TOKEN,
  });

  const response = await request(options);

  const zipPath = linuxAsset.name;
  const file = fs.createWriteStream(zipPath);

  file.write(Buffer.from(response.data));
  file.end();
};

(async function () {
  try {
    await download();
  } catch (e) {
    process.exit(1);
  }
})();
