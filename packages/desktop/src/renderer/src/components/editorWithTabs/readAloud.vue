<template>
  <div
    class="read-aloud"
    :class="{ expanded: open && !collapsed, compact: open && collapsed }"
  >
    <button
      v-if="!open"
      type="button"
      class="plain-button read-aloud-open"
      :disabled="!editorStore.currentFile"
      @click="start"
    >
      <el-icon><Headset /></el-icon>
      {{ t('readAloud.title') }}
    </button>
    <div
      v-else-if="collapsed"
      class="compact-controls"
      :aria-label="t('readAloud.title')"
    >
      <el-icon><Headset /></el-icon>
      <span
        class="reading-status"
        role="status"
      >{{ statusText }}</span>
      <button
        type="button"
        class="plain-button"
        :aria-label="playLabel"
        :title="playLabel"
        @click="togglePlayback"
      >
        <el-icon><VideoPause v-if="active" /><VideoPlay v-else /></el-icon>
      </button>
      <button
        type="button"
        class="plain-button"
        :aria-label="t('readAloud.stop')"
        :title="t('readAloud.stop')"
        @click="close"
      >
        <el-icon><Close /></el-icon>
      </button>
      <button
        type="button"
        class="plain-button"
        @click="showControls"
      >
        {{ t('readAloud.showControls') }}
      </button>
    </div>
    <section
      v-else
      :aria-label="t('readAloud.title')"
    >
      <div
        class="reading-controls"
        role="group"
        :aria-label="t('readAloud.playback')"
      >
        <strong>{{ t('readAloud.title') }}</strong>
        <button
          type="button"
          class="plain-button"
          :aria-expanded="tuning"
          @click="toggleTuning"
        >
          {{ t('readAloud.tuneVoice') }}
        </button>
        <button
          v-if="previewing"
          type="button"
          class="plain-button"
          @click="start"
        >
          {{ t('readAloud.readDocument') }}
        </button>
        <button
          type="button"
          class="plain-button"
          :title="t('readAloud.previousParagraph')"
          :aria-label="t('readAloud.previousParagraph')"
          :disabled="!hasText"
          @click="player.paragraph(-1)"
        >
          <el-icon><DArrowLeft /></el-icon>
        </button>
        <button
          type="button"
          class="plain-button"
          :title="t('readAloud.previousSentence')"
          :aria-label="t('readAloud.previousSentence')"
          :disabled="!hasText"
          @click="player.sentence(-1)"
        >
          <el-icon><ArrowLeft /></el-icon>
        </button>
        <button
          type="button"
          class="plain-button play-button"
          :title="playLabel"
          :aria-label="playLabel"
          :disabled="!hasText"
          @click="togglePlayback"
        >
          <el-icon><VideoPause v-if="active" /><VideoPlay v-else /></el-icon>
        </button>
        <button
          type="button"
          class="plain-button"
          :title="t('readAloud.nextSentence')"
          :aria-label="t('readAloud.nextSentence')"
          :disabled="!hasText || state.index + 1 >= sentences.length"
          @click="player.sentence(1)"
        >
          <el-icon><ArrowRight /></el-icon>
        </button>
        <button
          type="button"
          class="plain-button"
          :title="t('readAloud.nextParagraph')"
          :aria-label="t('readAloud.nextParagraph')"
          :disabled="!hasText || currentParagraph >= lastParagraph"
          @click="player.paragraph(1)"
        >
          <el-icon><DArrowRight /></el-icon>
        </button>
        <button
          type="button"
          class="plain-button"
          :title="t('readAloud.stop')"
          :aria-label="t('readAloud.stop')"
          @click="close"
        >
          <el-icon><Close /></el-icon>
        </button>
        <span
          class="reading-status"
          role="status"
        >{{ statusText }}</span>
        <label class="reading-speed">
          {{ t('readAloud.speed') }}
          <input
            type="range"
            min="0.5"
            max="2"
            step="0.05"
            :value="state.rate"
            :aria-label="t('readAloud.speed')"
            @input="changeRate"
          >
          <output>{{ state.rate.toFixed(2) }}×</output>
        </label>
        <button
          type="button"
          class="plain-button"
          @click="setPlaybackRate(1)"
        >
          {{ t('readAloud.normalSpeed') }}
        </button>
        <button
          type="button"
          class="plain-button"
          @click="hideControls"
        >
          {{ t('readAloud.hideControls') }}
        </button>
      </div>
      <div
        v-if="state.error || !hasText"
        class="reading-error"
        role="alert"
      >
        {{ errorText }}
      </div>
      <p
        v-else
        class="reading-sentence"
      >
        {{ sentences[state.index]?.text }}
      </p>
      <label class="skip-citations">
        <input
          v-model="skipCitations"
          type="checkbox"
          @change="restart"
        >
        {{ t('readAloud.skipCitations') }}
      </label>
      <label class="auto-hide-controls">
        <input
          v-model="autoHide"
          type="checkbox"
        >
        {{ t('readAloud.autoHideControls') }}
      </label>
      <voice-settings
        v-if="tuning"
        :model-value="voice"
        :can-preview="!!editorStore.currentFile?.markdown.trim()"
        @update:model-value="updateVoice"
        @preview="previewVoice"
      />
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import {
  ArrowLeft,
  ArrowRight,
  Close,
  DArrowLeft,
  DArrowRight,
  Headset,
  VideoPause,
  VideoPlay
} from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import { useEditorStore } from '@/store/editor'
import {
  ReadAloudPlayer,
  createReadingAudio,
  type ReadingSentence,
  type ReadingState
} from '@/services/readAloud'
import { readingSentences } from '@/util/readingText'
import { loadSpeechCalibration, saveSpeechCalibration } from '@/util/speechPreferences'
import type { SpeechVoiceSettings } from '@shared/types/speech'
import VoiceSettings from './voiceSettings.vue'

const { t } = useI18n()
const editorStore = useEditorStore()
const open = ref(false)
const collapsed = ref(false)
const autoHide = ref(true)
let collapseWhenReady = false
const tuning = ref(false)
const previewing = ref(false)
const voice = ref(loadSpeechCalibration())
const skipCitations = ref(true)
const sentences = shallowRef<ReadingSentence[]>([])
const state = shallowRef<ReadingState>({ status: 'stopped', index: 0, rate: 1, error: null })
const ipc = window.electron.ipcRenderer
const player = new ReadAloudPlayer(
  {
    synthesize: (text, settings) => ipc.invoke('mt::speech::synthesize', text, settings),
    cancel: () => ipc.invoke('mt::speech::cancel')
  },
  createReadingAudio(),
  (value) => {
    state.value = value
    if (value.status === 'playing' && collapseWhenReady) {
      collapseWhenReady = false
      if (autoHide.value) {
        collapsed.value = true
        tuning.value = false
      }
    } else if (
      value.status === 'paused' ||
      value.status === 'error' ||
      value.status === 'finished'
    ) {
      collapsed.value = false
    }
  }
)
player.setVoice(voice.value)

const hasText = computed(() => sentences.value.length > 0)
const active = computed(() => state.value.status === 'playing' || state.value.status === 'loading')
const playLabel = computed(() => t(active.value ? 'readAloud.pause' : 'readAloud.play'))
const currentParagraph = computed(() => sentences.value[state.value.index]?.paragraph ?? 0)
const lastParagraph = computed(() => sentences.value.at(-1)?.paragraph ?? 0)
const statusText = computed(() => {
  if (state.value.status !== 'playing') return t(`readAloud.${state.value.status}`)
  return t('readAloud.progress', {
    sentence: state.value.index + 1,
    sentences: sentences.value.length,
    paragraph: currentParagraph.value + 1,
    paragraphs: lastParagraph.value + 1
  })
})
const errorText = computed(() => {
  if (!hasText.value) return t('readAloud.empty')
  return t(state.value.error === 'unavailable' ? 'readAloud.unavailable' : 'readAloud.failed')
})

const start = (): void => {
  if (!editorStore.currentFile) return
  editorStore.flushActiveEditor()
  previewing.value = false
  collapseWhenReady = true
  collapsed.value = false
  sentences.value = readingSentences(
    editorStore.currentFile.markdown,
    skipCitations.value,
    voice.value.voiceId.split('-')[0]
  )
  open.value = true
  player.start(sentences.value)
}
const close = (): void => {
  collapseWhenReady = false
  player.stop()
  open.value = false
}
const restart = (): void => {
  start()
}
const togglePlayback = (): void => {
  if (active.value) player.pause()
  else {
    collapseWhenReady = true
    player.play()
  }
}
const changeRate = (event: Event): void => {
  setPlaybackRate(Number((event.target as HTMLInputElement).value))
}
const setPlaybackRate = (rate: number): void => {
  player.setRate(rate)
  voice.value = { ...voice.value, rate: player.state.rate }
  saveSpeechCalibration(voice.value)
}
const showControls = (): void => {
  collapseWhenReady = false
  collapsed.value = false
}
const hideControls = (): void => {
  collapsed.value = true
  tuning.value = false
}
const toggleTuning = (): void => {
  tuning.value = !tuning.value
  if (tuning.value) collapseWhenReady = false
}
const updateVoice = (settings: SpeechVoiceSettings): void => {
  const changedVoice =
    voice.value.voiceId !== settings.voiceId || voice.value.speaker !== settings.speaker
  voice.value = changedVoice ? loadSpeechCalibration(settings.voiceId, settings.speaker) : settings
  player.setVoice(voice.value)
  saveSpeechCalibration(voice.value)
}
const previewVoice = (): void => {
  if (!editorStore.currentFile) return
  editorStore.flushActiveEditor()
  sentences.value = readingSentences(
    editorStore.currentFile.markdown,
    skipCitations.value,
    voice.value.voiceId.split('-')[0]
  ).slice(0, 1)
  open.value = true
  previewing.value = true
  collapseWhenReady = true
  player.start(sentences.value)
}
const removeMenuListener = ipc.on('mt::read-aloud', () => {
  start()
})
watch(
  () => editorStore.currentFile?.id,
  () => {
    close()
  }
)
onBeforeUnmount(() => {
  removeMenuListener()
  player.stop()
})
</script>

<style scoped>
.read-aloud {
  flex: 0 0 auto;
  color: var(--editorColor);
  font-size: 12px;
  text-align: end;
  border-bottom: 1px solid var(--editorColor10);
}
.read-aloud-open {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 14px;
}
.expanded {
  padding: 10px 16px;
  text-align: start;
  max-height: 45vh;
  overflow-y: auto;
}
.compact-controls {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  padding: 5px 14px;
}
.compact-controls button {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  min-width: 28px;
}
.compact-controls .reading-status {
  margin-inline-end: 0;
}
.auto-hide-controls {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-inline-start: 16px;
}
.reading-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.reading-controls button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  min-height: 28px;
  border-radius: 4px;
}
.reading-controls button:hover:not(:disabled),
.read-aloud-open:hover:not(:disabled) {
  background: var(--editorColor10);
}
button:focus-visible,
input:focus-visible {
  outline: 2px solid var(--themeColor);
  outline-offset: 2px;
}
button:disabled {
  opacity: 0.4;
}
.play-button {
  font-size: 20px;
}
.reading-status {
  margin-inline-end: auto;
}
.reading-speed {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.reading-speed input {
  width: 100px;
  accent-color: var(--themeColor);
}
.reading-sentence {
  margin: 8px 0;
  max-height: 3.5em;
  overflow-y: auto;
  line-height: 1.6;
  user-select: text;
}
.skip-citations {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.reading-error {
  margin: 8px 0;
  color: var(--notificationErrorColor);
}
</style>
