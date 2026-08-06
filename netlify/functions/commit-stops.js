const { Octokit } = require("@octokit/rest");

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };
  const token = process.env.GITHUB_TOKEN;
  if(!token) return { statusCode:500, body: 'Missing GITHUB_TOKEN' };

  const owner = 'sadiq7753';
  const repo = 'Roads';
  const path = 'stops.json';

  const octo = new Octokit({ auth: token });
  let body;
  try { body = JSON.parse(event.body); } catch(e){ return { statusCode:400, body: 'Invalid JSON' }; }
  // body should be the full stops array
  try {
    // try get current file to obtain sha
    const file = await octo.repos.getContent({ owner, repo, path, ref: 'main' });
    const sha = file.data.sha;
    const content = Buffer.from(JSON.stringify(body, null, 2)).toString('base64');
    await octo.repos.createOrUpdateFileContents({ owner, repo, path, message: 'Update stops.json from site', content, sha });
    return { statusCode:200, body: 'OK' };
  } catch (err) {
    if(err.status === 404){
      const content = Buffer.from(JSON.stringify(body, null, 2)).toString('base64');
      await octo.repos.createOrUpdateFileContents({ owner, repo, path, message: 'Create stops.json from site', content });
      return { statusCode:200, body: 'Created' };
    }
    console.error(err);
    return { statusCode:500, body: String(err) };
  }
};
