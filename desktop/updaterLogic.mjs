export const GITHUB_REPO = 'caducatrinck/busca-vagas'
export const WIN_ASSET_SUFFIX = '-win-x64-portable.exe'
export const LINUX_ASSET_SUFFIX = '-linux-x64.AppImage'

export function stripVersionTag(tag) {
  return String(tag || '')
    .trim()
    .replace(/^v/i, '')
}

/** @returns {number} >0 se a > b */
export function compareSemver(a, b) {
  const pa = stripVersionTag(a)
    .split('.')
    .map((n) => Number.parseInt(n, 10) || 0)
  const pb = stripVersionTag(b)
    .split('.')
    .map((n) => Number.parseInt(n, 10) || 0)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i += 1) {
    const da = pa[i] ?? 0
    const db = pb[i] ?? 0
    if (da !== db) return da - db
  }
  return 0
}

export function assetSuffixForPlatform(platform) {
  if (platform === 'win32') return WIN_ASSET_SUFFIX
  if (platform === 'linux') return LINUX_ASSET_SUFFIX
  return null
}

export function pickReleaseAsset(release, suffix) {
  if (!suffix) return null
  const assets = Array.isArray(release?.assets) ? release.assets : []
  const asset = assets.find(
    (a) => typeof a?.name === 'string' && a.name.endsWith(suffix),
  )
  if (!asset?.browser_download_url) return null
  return {
    name: String(asset.name),
    url: String(asset.browser_download_url),
  }
}

export function resolveAvailableUpdate({ release, currentVersion, platform }) {
  if (!release) {
    return { available: false, remoteVersion: null }
  }

  const remoteVersion = stripVersionTag(release.tag_name || release.name || '')
  const suffix = assetSuffixForPlatform(platform)
  const asset = pickReleaseAsset(release, suffix)

  if (
    !remoteVersion ||
    !asset ||
    compareSemver(remoteVersion, currentVersion) <= 0
  ) {
    return { available: false, remoteVersion: remoteVersion || null }
  }

  return {
    available: true,
    remoteVersion,
    assetName: asset.name,
    downloadUrl: asset.url,
  }
}

export function expectedArtifactName(version, platform) {
  const v = stripVersionTag(version)
  if (platform === 'win32') return `BuscaVagas-${v}${WIN_ASSET_SUFFIX}`
  if (platform === 'linux') return `BuscaVagas-${v}${LINUX_ASSET_SUFFIX}`
  return null
}
