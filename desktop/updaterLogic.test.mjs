import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  GITHUB_REPO,
  LINUX_ASSET_SUFFIX,
  WIN_ASSET_SUFFIX,
  assetSuffixForPlatform,
  compareSemver,
  expectedArtifactName,
  pickReleaseAsset,
  resolveAvailableUpdate,
  stripVersionTag,
} from './updaterLogic.mjs'

describe('stripVersionTag', () => {
  it('remove o prefixo v', () => {
    assert.equal(stripVersionTag('v1.2.3'), '1.2.3')
    assert.equal(stripVersionTag('V1.0.0'), '1.0.0')
  })

  it('mantém versão sem prefixo', () => {
    assert.equal(stripVersionTag('1.2.3'), '1.2.3')
  })

  it('trata vazio e espaços', () => {
    assert.equal(stripVersionTag(''), '')
    assert.equal(stripVersionTag('  v2.0.0  '), '2.0.0')
    assert.equal(stripVersionTag(null), '')
  })
})

describe('compareSemver', () => {
  it('compara major / minor / patch', () => {
    assert.ok(compareSemver('1.0.1', '1.0.0') > 0)
    assert.ok(compareSemver('1.0.0', '1.0.1') < 0)
    assert.equal(compareSemver('1.0.0', '1.0.0'), 0)
    assert.ok(compareSemver('2.0.0', '1.9.9') > 0)
    assert.ok(compareSemver('1.10.0', '1.9.0') > 0)
  })

  it('aceita tags com v', () => {
    assert.ok(compareSemver('v1.0.1', 'v1.0.0') > 0)
    assert.equal(compareSemver('v1.2.3', '1.2.3'), 0)
  })

  it('preenche partes faltantes com zero', () => {
    assert.equal(compareSemver('1.0', '1.0.0'), 0)
    assert.ok(compareSemver('1.1', '1.0.9') > 0)
  })
})

describe('assetSuffixForPlatform', () => {
  it('mapeia win e linux', () => {
    assert.equal(assetSuffixForPlatform('win32'), WIN_ASSET_SUFFIX)
    assert.equal(assetSuffixForPlatform('linux'), LINUX_ASSET_SUFFIX)
  })

  it('retorna null em plataformas sem build', () => {
    assert.equal(assetSuffixForPlatform('darwin'), null)
    assert.equal(assetSuffixForPlatform('freebsd'), null)
  })
})

describe('expectedArtifactName', () => {
  it('gera o nome do contrato de release', () => {
    assert.equal(
      expectedArtifactName('1.0.1', 'win32'),
      'BuscaVagas-1.0.1-win-x64-portable.exe',
    )
    assert.equal(
      expectedArtifactName('v1.0.1', 'linux'),
      'BuscaVagas-1.0.1-linux-x64.AppImage',
    )
    assert.equal(expectedArtifactName('1.0.1', 'darwin'), null)
  })
})

describe('pickReleaseAsset', () => {
  const release = {
    assets: [
      {
        name: 'BuscaVagas-1.0.1-linux-x64.AppImage',
        browser_download_url: 'https://example.com/linux',
      },
      {
        name: 'BuscaVagas-1.0.1-win-x64-portable.exe',
        browser_download_url: 'https://example.com/win',
      },
      {
        name: 'checksums.txt',
        browser_download_url: 'https://example.com/sum',
      },
    ],
  }

  it('escolhe o asset pelo sufixo da plataforma', () => {
    assert.deepEqual(pickReleaseAsset(release, WIN_ASSET_SUFFIX), {
      name: 'BuscaVagas-1.0.1-win-x64-portable.exe',
      url: 'https://example.com/win',
    })
    assert.deepEqual(pickReleaseAsset(release, LINUX_ASSET_SUFFIX), {
      name: 'BuscaVagas-1.0.1-linux-x64.AppImage',
      url: 'https://example.com/linux',
    })
  })

  it('ignora assets sem url ou nome inválido', () => {
    assert.equal(pickReleaseAsset({ assets: [{ name: 'x.exe' }] }, WIN_ASSET_SUFFIX), null)
    assert.equal(pickReleaseAsset({ assets: null }, WIN_ASSET_SUFFIX), null)
    assert.equal(pickReleaseAsset(null, WIN_ASSET_SUFFIX), null)
    assert.equal(pickReleaseAsset(release, null), null)
  })
})

describe('resolveAvailableUpdate', () => {
  const release = {
    tag_name: 'v1.0.1',
    assets: [
      {
        name: 'BuscaVagas-1.0.1-win-x64-portable.exe',
        browser_download_url: 'https://example.com/win',
      },
      {
        name: 'BuscaVagas-1.0.1-linux-x64.AppImage',
        browser_download_url: 'https://example.com/linux',
      },
    ],
  }

  it('oferece update quando remoto é maior e há asset', () => {
    assert.deepEqual(
      resolveAvailableUpdate({
        release,
        currentVersion: '1.0.0',
        platform: 'win32',
      }),
      {
        available: true,
        remoteVersion: '1.0.1',
        assetName: 'BuscaVagas-1.0.1-win-x64-portable.exe',
        downloadUrl: 'https://example.com/win',
      },
    )
  })

  it('não oferece se versão for igual ou menor', () => {
    assert.deepEqual(
      resolveAvailableUpdate({
        release,
        currentVersion: '1.0.1',
        platform: 'win32',
      }),
      { available: false, remoteVersion: '1.0.1' },
    )
    assert.deepEqual(
      resolveAvailableUpdate({
        release,
        currentVersion: '2.0.0',
        platform: 'linux',
      }),
      { available: false, remoteVersion: '1.0.1' },
    )
  })

  it('não oferece sem release ou sem asset da plataforma', () => {
    assert.deepEqual(
      resolveAvailableUpdate({
        release: null,
        currentVersion: '1.0.0',
        platform: 'win32',
      }),
      { available: false, remoteVersion: null },
    )
    assert.deepEqual(
      resolveAvailableUpdate({
        release: { tag_name: 'v1.0.1', assets: [] },
        currentVersion: '1.0.0',
        platform: 'win32',
      }),
      { available: false, remoteVersion: '1.0.1' },
    )
    assert.deepEqual(
      resolveAvailableUpdate({
        release,
        currentVersion: '1.0.0',
        platform: 'darwin',
      }),
      { available: false, remoteVersion: '1.0.1' },
    )
  })

  it('aceita name do release quando tag_name falta', () => {
    const byName = resolveAvailableUpdate({
      release: {
        name: 'v1.2.0',
        assets: [
          {
            name: expectedArtifactName('1.2.0', 'linux'),
            browser_download_url: 'https://example.com/app',
          },
        ],
      },
      currentVersion: '1.1.0',
      platform: 'linux',
    })
    assert.equal(byName.available, true)
    assert.equal(byName.remoteVersion, '1.2.0')
  })
})

describe('contrato do repositório', () => {
  it('aponta para o repo público do Busca Vagas', () => {
    assert.equal(GITHUB_REPO, 'caducatrinck/busca-vagas')
  })
})
