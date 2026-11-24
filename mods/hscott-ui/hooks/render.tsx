// Turns a tab's plain-data view into the surface's elements. The only file
// of hscott-ui that knows about Box, Text and Button.
import { update } from 'claude-code'
import type { EngineInterface, RenderElement, RenderInput, RenderNode } from 'claude-code'

import type { HscottUiNode, HscottUiView } from '../types'

const COLLAPSED = { plugin: 'hscott-ui', key: 'collapsed' } as const

/** The press key hscott-ui gives a mod's element: `<tab>:<key>`. */
export const pressKey = (tab: string, key: string): string => `${tab}:${key}`

/** The press key of a section heading, which hscott-ui answers itself. */
export const sectionKey = (tab: string, key: string): string => `${tab}:section:${key}`

/** Rows are pressed for their owner's sake: the owner hears ui.press. */
const ownerHandles = async (): Promise<void> => undefined

/** Elements for the parts that are present, so no `false` reaches a tree. */
const present = (...parts: (RenderNode | undefined)[]): RenderNode[] =>
  parts.filter((part): part is RenderNode => part !== undefined)

export async function drawView(
  $: EngineInterface,
  e: RenderInput,
  tab: string,
  view: HscottUiView,
): Promise<RenderElement> {
  const { Box, Text, Button } = $.ui.resolve(e)

  const isCollapsed = async (key: string, initial: boolean): Promise<boolean> => {
    const { value } = await $.state.get({ ...COLLAPSED, id: `${tab}:${key}` })
    return value ?? initial
  }

  const draw = async (node: HscottUiNode, index: number): Promise<RenderNode> => {
    switch (node.type) {
      case 'section': {
        const initial = node.collapsed === true
        const collapsed = await isCollapsed(node.key, initial)
        const toggle = () =>
          update($, { ...COLLAPSED, id: `${tab}:${node.key}` }, was => !(was ?? initial))
        const children = collapsed ? [] : await Promise.all(node.children.map(draw))
        const heading = (
          <Button key={sectionKey(tab, node.key)} plain onPress={toggle}>
            {...present(
              collapsed ? '▸ ' : '▾ ',
              <Text bold>{node.title}</Text>,
              node.detail === undefined ? undefined : <Text dimColor>{` ${node.detail}`}</Text>,
            )}
          </Button>
        )
        const body =
          children.length === 0 ? undefined : (
            <Box flexDirection="column" paddingLeft={2}>
              {...children}
            </Box>
          )
        return (
          <Box key={`s-${node.key}`} flexDirection="column" marginTop={index === 0 ? 0 : 1}>
            {...present(heading, body)}
          </Box>
        )
      }
      case 'row': {
        const head = present(
          node.badge === undefined ? undefined : <Text dimColor>{`${node.badge} `}</Text>,
          <Text dimColor={node.dim === true}>{node.title}</Text>,
        )
        const line =
          node.key === undefined ? (
            <Text wrap="truncate-end">{...head}</Text>
          ) : (
            <Button key={pressKey(tab, node.key)} plain onPress={ownerHandles}>
              {...head}
            </Button>
          )
        const detail =
          node.detail === undefined ? undefined : (
            <Text dimColor wrap="truncate-end">{`  ${node.detail}`}</Text>
          )
        return (
          <Box key={`r-${node.key ?? index}`} flexDirection="column">
            {...present(line, detail)}
          </Box>
        )
      }
      case 'text':
        return (
          <Text dimColor={node.dim === true} bold={node.bold === true} color={node.color}>
            {node.text}
          </Text>
        )
      case 'button':
        return <Button key={pressKey(tab, node.key)} label={node.label} onPress={ownerHandles} />
      case 'empty':
        return (
          <Text dimColor italic>
            {node.text}
          </Text>
        )
    }
  }

  const body = await Promise.all(view.map(draw))
  return <Box flexDirection="column">{...body}</Box>
}
