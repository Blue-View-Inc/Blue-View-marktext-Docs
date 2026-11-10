<template>
  <div class="voice-settings">
    <div class="voice-choices">
      <label>
        {{ t('readAloud.language') }}
        <select
          v-model="language"
          :aria-label="t('readAloud.language')"
          @change="chooseLanguage"
        >
          <option
            v-for="item in languages"
            :key="item.code"
            :value="item.code"
          >
            {{ item.name }}
          </option>
        </select>
      </label>
      <label>
        {{ t('readAloud.voice') }}
        <select
          :value="modelValue.voiceId"
          :aria-label="t('readAloud.voice')"
          @change="chooseVoice"
        >
          <option
            v-for="voice in visibleVoices"
            :key="voice.id"
            :value="voice.id"
          >
            {{ voice.name }} · {{ voice.country }} · {{ voice.quality
            }}{{ voice.installed ? ` · ${t('readAloud.installed')}` : '' }}
          </option>
        </select>
      </label>
      <label v-if="speakers.length">
        {{ t('readAloud.speaker') }}
        <select
          :value="modelValue.speaker"
          :aria-label="t('readAloud.speaker')"
          @change="chooseSpeaker"
        >
          <option
            v-for="[name, id] in speakers"
            :key="id"
            :value="id"
          >{{ name }}</option>
        </select>
      </label>
      <button
        v-if="selected && !selected.installed"
        type="button"
        class="plain-button"
        :disabled="downloading"
        @click="install"
      >
        {{
          downloading
            ? t('readAloud.downloading')
            : t('readAloud.downloadVoice', { size: Math.ceil(selected.size / 1024 / 1024) })
        }}
      </button>
      <button
        type="button"
        class="plain-button"
        :disabled="!selected?.installed || !canPreview"
        @click="emit('preview')"
      >
        {{ t('readAloud.preview') }}
      </button>
    </div>
    <label class="show-all"><input
      v-model="showAll"
      type="checkbox"
    > {{ t('readAloud.showAllVoices') }}</label>
    <p class="voice-help">
      {{ t('readAloud.voiceHelp') }}
    </p>
    <p
      v-if="downloadError"
      role="alert"
    >
      {{ t('readAloud.downloadFailed') }}
    </p>
    <div class="calibration-controls">
      <label>
        {{ t('readAloud.style') }}
        <select
          :value="modelValue.style"
          :aria-label="t('readAloud.style')"
          @change="changeStyle"
        >
          <option value="relaxed">{{ t('readAloud.relaxed') }}</option>
          <option value="neutral">{{ t('readAloud.neutral') }}</option>
          <option value="expressive">{{ t('readAloud.expressive') }}</option>
        </select>
      </label>
      <label>
        {{ t('readAloud.expression') }}
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          :value="modelValue.expression"
          :aria-label="t('readAloud.expression')"
          @change="changeNumber('expression', $event)"
        >
      </label>
      <label>
        {{ t('readAloud.sentencePause') }}
        <input
          type="range"
          min="0.1"
          max="1"
          step="0.05"
          :value="modelValue.sentencePause"
          :aria-label="t('readAloud.sentencePause')"
          @change="changeNumber('sentencePause', $event)"
        >
        <output>{{ modelValue.sentencePause.toFixed(2) }} s</output>
      </label>
      <label>
        {{ t('readAloud.paragraphPause') }}
        <input
          type="range"
          min="0.1"
          max="2"
          step="0.1"
          :value="modelValue.paragraphPause"
          :aria-label="t('readAloud.paragraphPause')"
          @change="changeNumber('paragraphPause', $event)"
        >
        <output>{{ modelValue.paragraphPause.toFixed(1) }} s</output>
      </label>
    </div>
    <details @toggle="showLicense">
      <summary>{{ t('readAloud.voiceLicense') }}</summary>
      <p>{{ t('readAloud.licenseHelp') }}</p>
      <pre>{{ licenseText || t('readAloud.loadingLicense') }}</pre>
      <button
        type="button"
        class="plain-button"
        @click="openLicense"
      >
        {{ t('readAloud.openModelCard') }}
      </button>
      <button
        type="button"
        class="plain-button"
        @click="openEngineLicense"
      >
        {{ t('readAloud.engineLicense') }}
      </button>
    </details>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  recommendedSpeechVoices,
  type SpeechVoice,
  type SpeechVoiceSettings
} from '@shared/types/speech'

const props = defineProps<{ modelValue: SpeechVoiceSettings; canPreview: boolean }>()
const emit = defineEmits<{
  'update:modelValue': [settings: SpeechVoiceSettings]
  preview: []
}>()
const { t } = useI18n()
const voices = ref<SpeechVoice[]>([])
const language = ref(props.modelValue.voiceId.split('_')[0])
const showAll = ref(false)
const downloading = ref(false)
const downloadError = ref(false)
const licenseText = ref('')
const licenseOpen = ref(false)
const ipc = window.electron.ipcRenderer
const languages = computed(() =>
  [
    ...new Map(
      voices.value.map((voice) => [
        voice.language.split('_')[0],
        {
          code: voice.language.split('_')[0],
          name: voice.languageName
        }
      ])
    ).values()
  ].sort((a, b) => a.name.localeCompare(b.name))
)
const selected = computed(() => voices.value.find((voice) => voice.id === props.modelValue.voiceId))
const languageVoices = computed(() =>
  voices.value.filter((voice) => voice.language.split('_')[0] === language.value)
)
const visibleVoices = computed(() => {
  const choices = showAll.value
    ? languageVoices.value
    : recommendedSpeechVoices(languageVoices.value)
  if (
    selected.value &&
    selected.value.language.split('_')[0] === language.value &&
    !choices.some((voice) => voice.id === selected.value?.id)
  ) {
    const distinct = choices.filter(
      (voice) => voice.name !== selected.value?.name || voice.language !== selected.value?.language
    )
    return [selected.value, ...distinct].slice(0, 5)
  }
  return choices
})
const speakers = computed(() => Object.entries(selected.value?.speakers ?? {}))

const refresh = async (): Promise<void> => {
  try {
    voices.value = await ipc.invoke('mt::speech::voices')
  } catch {
    downloadError.value = true
  }
}
const chooseLanguage = (): void => {
  const choices = recommendedSpeechVoices(languageVoices.value)
  const voice = choices.find((voice) => voice.installed) ?? choices[0]
  if (voice) emit('update:modelValue', { ...props.modelValue, voiceId: voice.id, speaker: 0 })
}
const chooseVoice = (event: Event): void => {
  emit('update:modelValue', {
    ...props.modelValue,
    voiceId: (event.target as HTMLSelectElement).value,
    speaker: 0
  })
}
const chooseSpeaker = (event: Event): void => {
  emit('update:modelValue', {
    ...props.modelValue,
    speaker: Number((event.target as HTMLSelectElement).value)
  })
}
const changeStyle = (event: Event): void => {
  const style = (event.target as HTMLSelectElement).value as SpeechVoiceSettings['style']
  const presets = {
    relaxed: { expression: 0.3, sentencePause: 0.3, paragraphPause: 0.7 },
    neutral: { expression: 0.5, sentencePause: 0.2, paragraphPause: 0.5 },
    expressive: { expression: 0.8, sentencePause: 0.15, paragraphPause: 0.35 }
  }
  emit('update:modelValue', { ...props.modelValue, style, ...presets[style] })
}
const changeNumber = (
  key: 'expression' | 'sentencePause' | 'paragraphPause',
  event: Event
): void => {
  emit('update:modelValue', {
    ...props.modelValue,
    [key]: Number((event.target as HTMLInputElement).value)
  })
}
const install = async (): Promise<void> => {
  const id = props.modelValue.voiceId
  downloading.value = true
  downloadError.value = false
  try {
    const result = await ipc.invoke('mt::speech::install-voice', id)
    downloadError.value = !result.ok
    await refresh()
  } catch {
    downloadError.value = true
  } finally {
    downloading.value = false
  }
}
const loadLicense = async (): Promise<void> => {
  const id = props.modelValue.voiceId
  licenseText.value = ''
  try {
    const text = await ipc.invoke('mt::speech::voice-license', id)
    if (id === props.modelValue.voiceId)
      licenseText.value = text ?? t('readAloud.licenseUnavailable')
  } catch {
    licenseText.value = t('readAloud.licenseUnavailable')
  }
}
const showLicense = (event: Event): void => {
  licenseOpen.value = (event.target as HTMLDetailsElement).open
  if (licenseOpen.value) void loadLicense()
}
const openLicense = (): void => {
  const voice = selected.value
  if (!voice) return
  const locale = voice.language
  const family = locale.split('_')[0]
  void window.electron.shell.openExternal(
    `https://huggingface.co/rhasspy/piper-voices/blob/main/${family}/${locale}/${voice.name}/${voice.quality}/MODEL_CARD`
  )
}
const openEngineLicense = (): void => {
  void window.electron.shell.openExternal(
    'https://github.com/OHF-Voice/piper1-gpl/blob/v1.8.0/COPYING'
  )
}
watch(
  () => props.modelValue.voiceId,
  () => {
    language.value = props.modelValue.voiceId.split('_')[0]
    licenseText.value = ''
    if (licenseOpen.value) void loadLicense()
  }
)
onMounted(() => {
  void refresh()
})
</script>

<style scoped>
.voice-settings {
  border-top: 1px solid var(--editorColor10);
  margin-top: 10px;
  padding-top: 10px;
}
.voice-choices,
.calibration-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}
label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
select {
  max-width: 280px;
  color: var(--editorColor);
  background: var(--editorBgColor);
  border: 1px solid var(--editorColor30);
  border-radius: 4px;
  padding: 4px;
}
.calibration-controls {
  margin: 10px 0;
}
input[type='range'] {
  width: 90px;
  accent-color: var(--themeColor);
}
button {
  padding: 5px 8px;
  border: 1px solid var(--editorColor20);
  border-radius: 4px;
}
.show-all {
  margin-top: 8px;
}
.voice-help {
  opacity: 0.7;
}
pre {
  white-space: pre-wrap;
  max-height: 200px;
  overflow: auto;
  font-family: inherit;
  font-size: 12px;
}
summary {
  cursor: pointer;
}
</style>
