/**
 * Mount the deployment's caveman skill and the prompt section that makes the model use it.
 *
 * Two registrations, both inside {@link apply} so they belong to the agent scope that mounted this
 * plugin rather than to module load:
 *
 * - the `caveman-ultra` skill, read from the file next to this module, so the catalog entry and the
 *   skill body cannot drift apart;
 * - a prompt section at order 60, between the deployment persona (0) and the plan policy (500),
 *   which tells the model which skill is authoritative here and how to turn it off.
 *
 * The section text is a provider, not a frozen string: the level is read per assembly, so a change
 * to `OMO_CAVEMAN_LEVEL` is visible on the next turn instead of requiring a re-mount. The text
 * deliberately contains no prompt variables — a `{{…}}` there would be interpolated by the prompt
 * registry, and none of these words is a registered variable.
 *
 * @module caveman-autoload
 */

import { readFileSync } from 'node:fs'

/** Cordis plugin name. */
export const name = 'caveman-autoload'

/**
 * The skill catalog and the prompt registry are both required: without the first there is nothing
 * to register, and without the second there is no place to say "use it".
 */
export const inject = ['systemPrompt', 'skills']

/** The skill file this module publishes, resolved beside this module. */
const skillFile = new URL('./skills/caveman-ultra/SKILL.md', import.meta.url)

/** The name the skill is catalogued under. */
const SKILL_NAME = 'caveman-ultra'

/** The fallback level when the deployment sets no `OMO_CAVEMAN_LEVEL`. */
const DEFAULT_LEVEL = 'ultra'

/**
 * Read the skill file.
 *
 * A missing or empty file fails loud: registering an empty skill would put a catalog entry in front
 * of the model that says nothing, which is worse than not shipping it at all.
 *
 * @returns the file's text.
 */
function readSkill() {
  const content = readFileSync(skillFile, 'utf8')
  if (content.trim() === '') throw new Error(`${SKILL_NAME}: skill file is empty`)
  return content
}

/**
 * Extract the `description` from a skill file's frontmatter.
 *
 * The description is taken from the file itself rather than repeated here, because a second copy
 * would be free to drift out of step with the string a reader sees. The value is parsed as a JSON
 * string when it is quoted (the same escapes the file already uses), and kept verbatim otherwise.
 *
 * @param content - the skill file's text.
 * @returns the frontmatter description.
 */
function readDescription(content) {
  const frontmatter = /^---\n([\s\S]*?)\n---/.exec(content)
  if (frontmatter === null) throw new Error(`${SKILL_NAME}: skill file has no frontmatter`)

  const line = /^description:[ \t]*(.*)$/m.exec(frontmatter[1])
  if (line === null) throw new Error(`${SKILL_NAME}: skill file has no description`)

  const raw = line[1].trim()
  const description = raw.startsWith('"') ? JSON.parse(raw) : raw
  if (description === '') throw new Error(`${SKILL_NAME}: skill file has an empty description`)
  return description
}

/**
 * The level in force for this deployment.
 *
 * Read on every call, not once at mount, so the level is whatever the deployment says at the moment
 * the prompt is assembled.
 *
 * @returns the configured level, or the default when nothing is set.
 */
function level() {
  const configured = process.env.OMO_CAVEMAN_LEVEL?.trim()
  return configured === undefined || configured === '' ? DEFAULT_LEVEL : configured
}

/**
 * The prompt section that tells the model this skill is the one in force.
 *
 * Rules come first and the exception is a subordinate clause, because a reader who stops after the
 * first sentence must still get the default right.
 *
 * @returns the section text for the current level.
 */
function loaderText() {
  return [
    '## caveman 表达规则',
    '',
    `本部署生效的 caveman skill 是 \`${SKILL_NAME}\`。每轮写答案之前先调用这个 skill，再按它输出。`,
    '',
    `默认级别是 **${level()}**：部署环境变量 \`OMO_CAVEMAN_LEVEL\` 决定它，未设置时取 \`${DEFAULT_LEVEL}\`。` +
      '切级不需要命令，在请求里直接声明级别即可；选定的级别在本次会话剩余时间内保持生效，直到用户改口。',
    '',
    '用户说 `stop caveman` 或 `normal mode` 时停用。',
    '',
    'Auto-Clarity：安全警告、不可逆操作的确认、以及顺序不能乱的多步指令，用正常散文写清楚——' +
      '压缩让位于清晰，说清楚之后再恢复压缩风格。',
    '',
    `从属说明：若 skill catalog 里另有一条名为 \`caveman\` 的条目，那是本部署已经取代的旧副本` +
      '（其正文默认 full），按 `' + SKILL_NAME + '` 的规则处理，不要把两者混用。',
  ].join('\n')
}

/**
 * Register the skill and the section that points at it.
 *
 * @param ctx - the preset's agent scope context.
 */
export function apply(ctx) {
  const content = readSkill()
  const description = readDescription(content)

  ctx.effect(
    () => ctx.skills.register({ name: SKILL_NAME, description, content }),
    'caveman-autoload: skill',
  )

  ctx.effect(
    () => ctx.systemPrompt.section({ name: 'caveman:loader', order: 60, text: loaderText }),
    'caveman-autoload: loader section',
  )
}