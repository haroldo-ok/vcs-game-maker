<template>
  <div>
    <v-card class="editor-container">
      <v-card-title>
        Generated bBasic code
      </v-card-title>
      <v-card-text class="tab-intro-section">
        <p class="v-messages theme--light v-messages__message generated-code-intro-paragraph">
          The batari Basic source this project compiles down to, from its last "Update ROM" build -
          useful for debugging a compile error, or just seeing what your blocks actually produce.
          Save it to a file or copy it to the clipboard below.
        </p>
      </v-card-text>
      <div
        class="generated-code-toolbar tight-under-intro"
        :class="{'generated-code-toolbar-scrolled': isToolbarScrolled}"
      >
        <div class="generated-code-toolbar-row">
          <v-btn
            icon
            small
            class="generated-code-flat-icon-btn data-icon-btn-size"
            title="Save Generated Code"
            @click="handleSaveGeneratedCode"
          >
            <v-icon>mdi-content-save</v-icon>
          </v-btn>
          <v-btn
            icon
            small
            class="generated-code-flat-icon-btn data-icon-btn-size"
            :title="copyButtonTitle"
            @click="handleCopyGeneratedCode"
          >
            <v-icon>mdi-content-copy</v-icon>
          </v-btn>
        </div>
      </div>
      <div class="code-scroll-wrapper">
        <div class="code-scroll">
          <pre class="line-numbers-gutter">{{ lineNumbersText }}</pre>
          <vue-code-highlight language="basic" class="code-container">
            <pre v-html="generatedBasic"></pre>
          </vue-code-highlight>
        </div>
      </div>
      <!-- A genuine flex footer of .editor-container now (see that class's
           comment), not "position: sticky" layered over the scrollable
           area anymore - an earlier version used sticky, which visually
           overlaid the bottom slice of .code-scroll-wrapper rather than
           actually reserving its space, so a match on one of the last
           few lines could render right underneath it with no way to scroll
           it clear (confirmed as a real, reproducible bug - the container
           has no room to scroll past its max scrollHeight, so no amount
           of centering math could fix it). Being a real flex item instead
           means .code-scroll-wrapper's height is simply reduced to fit
           above it, so every line - including the last one - has real
           scrollable room to reach the middle of the actually-visible area. -->
      <div class="generated-code-search-dock">
        <v-text-field
          v-model="searchQuery"
          placeholder="Search generated code"
          dense
          hide-details
          clearable
          class="generated-code-search-field"
          @keydown.enter="handleSearchEnter"
          @keydown.shift.enter.prevent="goToMatch(currentMatchIndex - 1)"
        />
        <span v-if="searchQuery" class="generated-code-search-count">{{ searchCountText }}</span>
        <v-btn
          icon
          small
          class="generated-code-flat-icon-btn"
          title="Previous match (Shift+Enter)"
          :disabled="!matchCount"
          @click="goToMatch(currentMatchIndex - 1)"
        >
          <v-icon>mdi-chevron-up</v-icon>
        </v-btn>
        <v-btn
          icon
          small
          class="generated-code-flat-icon-btn"
          title="Next match (Enter)"
          :disabled="!matchCount"
          @click="goToMatch(currentMatchIndex + 1)"
        >
          <v-icon>mdi-chevron-down</v-icon>
        </v-btn>
      </div>
    </v-card>
  </div>
</template>
<script>
import {defineComponent, computed, ref, watch, nextTick, onMounted, onBeforeUnmount, getCurrentInstance} from '@vue/composition-api';
import {saveAs} from 'file-saver';
import {component as VueCodeHighlight} from 'vue-code-highlight';
import 'vue-code-highlight/themes/duotone-sea.css';

import {useGeneratedBasic} from '../hooks/generated';
import {getDateInfix} from '../utils/date';

export default defineComponent({
  name: 'GeneratedCode',
  components: {VueCodeHighlight},
  setup() {
    const generatedBasic = useGeneratedBasic();
    // Display-only - never touches generatedBasic itself, so saving/exporting
    // (see handleSaveGeneratedCode) and compiling both still see the exact
    // same plain text they always have, with no line numbers mixed in.
    const lineNumbersText = computed(() => {
      const lineCount = ((generatedBasic.value || '').match(/\n/g) || []).length + 1;
      return Array.from({length: lineCount}, (_, i) => i + 1).join('\n');
    });
    // Same "growing padding + a bottom border once actually scrolled"
    // treatment as the graphic editor toolbar: here the code area below the
    // toolbar is what scrolls.
    const instance = getCurrentInstance();
    const isToolbarScrolled = ref(false);
    let toolbarScrollContainer = null;
    const handleToolbarScroll = (event) => {
      isToolbarScrolled.value = event.target.scrollTop > 0;
    };
    onMounted(() => {
      toolbarScrollContainer = instance.proxy.$el.querySelector('.code-scroll-wrapper');
      if (toolbarScrollContainer) toolbarScrollContainer.addEventListener('scroll', handleToolbarScroll);
    });
    onBeforeUnmount(() => {
      if (toolbarScrollContainer) toolbarScrollContainer.removeEventListener('scroll', handleToolbarScroll);
    });
    // Reverts on its  after a couple seconds - see handleCopyGeneratedCode.
    // Shown as this icon-only button's  title tooltip now (there's no
    // visible label left to show it in directly).
    const copyButtonTitle = ref('Copy Generated Code');
    const handleSaveGeneratedCode = () => {
      const textBlob = new Blob([generatedBasic.value], {type: 'text/plain'});
      saveAs(textBlob, `generated-bBasic-${getDateInfix()}.bas`);
    };
    const handleCopyGeneratedCode = async () => {
      try {
        await navigator.clipboard.writeText(generatedBasic.value);
        copyButtonTitle.value = 'Copied!';
      } catch (e) {
        console.error('Error copying generated code to clipboard', e);
        copyButtonTitle.value = 'Copy failed';
      }
      setTimeout(() => {
        copyButtonTitle.value = 'Copy Generated Code';
      }, 2000);
    };

    // Every piece of the search feature below is kept entirely in setup(),
    // not mixed into a separate Options API data()/computed/watch/methods
    // block the way an earlier version of this had: confirmed as a real
    // bug - this component's existing pattern is setup() (returning
    // plain refs) plus a genuinely separate methods: block for the two
    // handlers above, and adding a NEW data()/computed/watch alongside that
    // broke Vue's  reactivity wiring (surfaced as "searchQuery is not
    // defined on the instance" console warnings, and meant selecting/
    // scrolling to a match silently never actually ran).
    const searchQuery = ref('');
    const matchCount = ref(0);
    // Bumped by every selectCurrentMatch() call, read back by its
    // pending retries below - lets an OLDER search's retry chain notice a
    // NEWER one has since started and quietly stop, instead of finishing
    // late and overwriting the newer (correct) highlight with its
    // stale one. Confirmed as a real bug without this: typing several
    // characters quickly starts one independent retry chain per keystroke
    // (see selectCurrentMatch's  comment on why a single attempt isn't
    // reliable to begin with), and nothing stopped an EARLIER keystroke's
    // chain from still being mid-retry when a LATER one's  chain
    // already finished - whichever one's setTimeout happened to fire last
    // won, regardless of which query was actually the current one.
    let searchGeneration = 0;
    // 0 when there are no matches; otherwise 1-based, matching what the
    // "X of Y" label shows the user - avoids an off-by-one translation at
    // every call site that just wants to show/advance the CURRENT match.
    const currentMatchIndex = ref(0);
    const searchCountText = computed(() =>
      matchCount.value ? `${currentMatchIndex.value} of ${matchCount.value}` : 'No matches');

    // Walks the RENDERED code pane's  text nodes (not generatedBasic
    // itself) with a TreeWalker, so this finds matches exactly where the
    // user can see them, however vue-code-highlight happened to split the
    // text across syntax-highlighting spans - a match straddling two
    // adjacent text nodes (e.g. a highlighted keyword right next to plain
    // text) is deliberately NOT found, the same real limitation a plain
    // per-node string search always has; rare enough for a debug-only
    // search field that a single shared Range spanning multiple DOM nodes
    // isn't worth the extra complexity here.
    // Looked up fresh via a live query every call - NOT the codePre template
    // ref an earlier version of this used - confirmed as the actual root
    // cause of every "match found but its node is already disconnected"
    // symptom the comments elsewhere in this file describe chasing: vue-
    // code-highlight appears to replace the <pre> element ITSELF (not just
    // its children) outside Vue's  virtual-DOM patching at some point
    // after mount, which leaves a Vue template ref (set once, when the
    // original element first mounted) pointing at a permanently-detached
    // element forever after - document.querySelector, unlike the stale
    // ref, always resolves to whatever's actually live right now.
    // Tracks a running newline count across nodes as it walks, so each
    // match also comes back with WHICH LINE it's on - used by selectMatch
    // below to scroll by line position instead of by the rendered DOM's
    // geometry (see its  comment for why the geometry approach isn't
    // reliable against this particular syntax highlighter).
    const findMatches = () => {
      const container = document.querySelector('.code-container pre');
      const query = (searchQuery.value || '').trim();
      if (!container || !query) return [];
      const lowerQuery = query.toLowerCase();
      const matches = [];
      const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      let lineOfNodeStart = 0;
      while (node) {
        const text = node.textContent;
        const lowerText = text.toLowerCase();
        let fromIndex = 0;
        let at = lowerText.indexOf(lowerQuery, fromIndex);
        while (at !== -1) {
          const line = lineOfNodeStart + (text.slice(0, at).match(/\n/g) || []).length;
          matches.push({node, start: at, end: at + query.length, line});
          fromIndex = at + query.length;
          at = lowerText.indexOf(lowerQuery, fromIndex);
        }
        lineOfNodeStart += (text.match(/\n/g) || []).length;
        node = walker.nextNode();
      }
      return matches;
    };

    // Uses the CSS Custom Highlight API (CSS.highlights/Highlight) to mark
    // the match, instead of either inserting a <mark> element or using
    // window.getSelection(). A real DOM insertion would land INSIDE vue-
    // code-highlight's  syntax-highlighting markup and get silently
    // discarded (or worse, corrupt a highlighting span) the next time it
    // re-tokenizes the code, since that markup is regenerated from
    // generatedBasic's plain text, not preserved across re-renders.
    // window.getSelection() was tried first and reverted: confirmed as a
    // real bug in TWO different ways - focusing the search input clears
    // any existing document Selection (a normal browser behavior, not a
    // mistake to work around), so every keystroke's  live-search call
    // either stole focus from the field the user was actively typing in
    // (if left unfocused after selecting) or silently wiped its
    // highlight the instant it tried to restore focus (if it re-focused
    // the field right after) - there was no way to keep both with
    // Selection. A CSS custom highlight isn't tied to focus at all, so it
    // just works, and the field never loses focus in the first place since
    // nothing here ever touches window.getSelection() anymore.
    const SEARCH_HIGHLIGHT_NAME = 'generated-code-search-match';
    const selectMatch = ({node, start, end, line}) => {
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, end);
      if (window.CSS && CSS.highlights) {
        CSS.highlights.set(SEARCH_HIGHLIGHT_NAME, new Highlight(range));
      }
      // NOT target.getBoundingClientRect()-based centering, and NOT
      // target.scrollIntoView() before that - both tried and abandoned.
      // scrollIntoView computed wildly wrong positions in this exact nested
      // flex/sticky layout (landing thousands of pixels off in either
      // direction). The getBoundingClientRect() version fixed that, but
      // confirmed unreliable for a different reason: vue-code-highlight
      // keeps re-tokenizing the code pane's  content on some schedule
      // independent of this component's  renders, which can shift a
      // given match's on-screen geometry between the moment a match is
      // found and the moment its position is actually read - a match late
      // in the file was seen computing a small/negative "already near
      // center" delta from a rect reading that didn't reflect where it
      // actually was.
      //
      // This instead uses the match's  LINE NUMBER (computed from the
      // plain generatedBasic text in findMatches, which never changes just
      // because the syntax highlighter re-tokenizes) against the total
      // line count and the container's  scrollHeight/clientHeight - a
      // proportional estimate, not a pixel-exact one, but built entirely
      // from numbers that stay valid regardless of what vue-code-highlight
      // is doing to the DOM at any given moment.
      // .code-scroll-wrapper (not .editor-container) is the actual
      // scrolling element now - the search dock moved out to be a real flex
      // footer of .editor-container instead of a "position: sticky" overlay
      // on top of the scrollable area (see the dock's  template comment
      // for the real, reproducible bug that caused), so clientHeight here
      // is already just the genuinely-visible code area with no need to
      // subtract the dock's  height from it anymore.
      const container = document.querySelector('.code-scroll-wrapper');
      if (container && typeof line === 'number') {
        const totalLines = ((generatedBasic.value || '').match(/\n/g) || []).length + 1;
        const scrollRange = container.scrollHeight - container.clientHeight;
        const proportion = totalLines > 1 ? line / totalLines : 0;
        const target = proportion * scrollRange - container.clientHeight / 2 +
          (scrollRange / totalLines) / 2;
        container.scrollTop = Math.max(0, Math.min(scrollRange, target));
      }
    };

    // Clears any highlight left over from a previous search - needed
    // whenever a search comes up with nothing (query cleared, or no longer
    // matches anything), since selectMatch only ever SETS the highlight,
    // never removes it by itself.
    const clearHighlight = () => {
      if (window.CSS && CSS.highlights) CSS.highlights.delete(SEARCH_HIGHLIGHT_NAME);
    };

    // Finds matches again and selects whichever one is now at
    // currentMatchIndex - deliberately a SEPARATE, later step from setting
    // matchCount/currentMatchIndex below, not folded into the same
    // findMatches() call. Confirmed as a real bug otherwise: writing to
    // matchCount/currentMatchIndex (both rendered in this same component's
    // template - the "X of Y" count and the prev/next buttons'
    // :disabled state) triggers a Vue re-render, and vue-code-highlight
    // reprocesses its slot content on every one parent's
    // re-renders regardless of whether generatedBasic's actual VALUE
    // changed - which replaces the code pane's text nodes with fresh ones
    // a moment later. Selecting on the SAME tick, before that replacement
    // happens, would grab nodes about to be detached.
    //
    // nextTick() waits for Vue's  render to finish, and findMatches()
    // itself always re-queries the live DOM fresh (see its  comment on
    // why - NOT a cached template ref, which was the actual root cause of
    // this staying broken even with nextTick() at first: vue-code-highlight
    // turned out to replace the <pre> element itself outside Vue's
    // patching, permanently orphaning any ref taken once at mount). A
    // small retry margin (a few attempts, a short beat apart) stays as a
    // safety net for the rare case a node is found an instant before it's
    // detached, rather than trusting a single nextTick() to always land in
    // the right window.
    //
    // generation is captured ONCE, by the outer (no-arg) call each fresh
    // search/navigation makes - not re-read on every retry - so this whole
    // chain can tell, at each step, whether a NEWER search has started
    // since IT began (searchGeneration will have moved on) and bail out
    // quietly rather than racing a later chain to set the final highlight
    // (see searchGeneration's  comment for the bug this fixes).
    const selectCurrentMatch = (generation = ++searchGeneration, attemptsLeft = 5) => {
      nextTick(() => {
        if (generation !== searchGeneration) return;
        const freshMatches = findMatches();
        const match = currentMatchIndex.value >= 1 && currentMatchIndex.value <= freshMatches.length ?
          freshMatches[currentMatchIndex.value - 1] : null;
        if (match && match.node.isConnected) {
          selectMatch(match);
        } else if (attemptsLeft > 0) {
          setTimeout(() => {
            if (generation === searchGeneration) selectCurrentMatch(generation, attemptsLeft - 1);
          }, 20);
        }
      });
    };

    // resetIndex: true for a fresh search (the query or the underlying code
    // itself changed, so any previously "current" match is meaningless) -
    // false isn't currently used but keeping the flag explicit (rather than
    // always resetting) documents that this distinction is deliberate, not
    // an oversight, for whichever future caller needs to re-run a search
    // without losing the user's place in it.
    const runSearch = (resetIndex) => {
      const matches = findMatches();
      matchCount.value = matches.length;
      if (resetIndex) currentMatchIndex.value = matches.length ? 1 : 0;
      if (matches.length) selectCurrentMatch();
      else clearHighlight();
    };

    // 1-based and wraps in both directions (index 0 or matchCount+1 both
    // loop back around) - re-finds matches fresh each call rather than
    // reusing a cached list, since this is only ever invoked from a click/
    // keypress, not a hot loop, and staying correct after any DOM change
    // matters more than avoiding a cheap re-walk.
    const goToMatch = (index) => {
      const matches = findMatches();
      matchCount.value = matches.length;
      if (!matches.length) {
        currentMatchIndex.value = 0;
        clearHighlight();
        return;
      }
      currentMatchIndex.value = ((index - 1 + matches.length) % matches.length) + 1;
      selectCurrentMatch();
    };

    const handleSearchEnter = () => {
      if (matchCount.value) goToMatch(currentMatchIndex.value + 1);
      else runSearch(true);
    };

    // vue-code-highlight re-renders its  children (re-tokenizing
    // generatedBasic into syntax-highlighted spans) whenever it changes, so
    // any match position found against the OLD DOM would be stale the
    // instant new code is generated - re-searching from scratch here, in
    // the same tick Vue re-renders, keeps the count/selection honest rather
    // than pointing at a match that silently moved or no longer exists.
    watch(generatedBasic, () => nextTick(() => runSearch(true)));
    watch(searchQuery, () => runSearch(true));

    return {
      isToolbarScrolled,
      generatedBasic, lineNumbersText, copyButtonTitle, handleSaveGeneratedCode, handleCopyGeneratedCode,
      searchQuery, matchCount, currentMatchIndex, searchCountText, goToMatch,
      handleSearchEnter,
    };
  },
});
</script>
<style scoped>
/* A flex column filling the whole tab now (title/toolbar, then the
   scrollable code area, then the search dock as a real footer) - it no
   longer scrolls itself (see .code-scroll-wrapper, which does) now that the
   dock needs to be a genuine flex item pinned below the scrollable area
   instead of a "position: sticky" overlay on top of it. */
.editor-container {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  /* App.vue's  global ".editor-container { border-radius: 0 !important }"
     already squares this off, same as every other tab's main card - kept
     here too (redundant with that !important rule, but harmless) since the
     search dock's matching "border-radius: 0" below is written as if
     this were 0, and the two are meant to be read together. */
  border-radius: 0;
}

/* Was a bare <p>, direct child of the v-card, with no v-card-text wrapper
   at all - unlike every other tab's intro paragraph, so it had neither the
   standard 16px left/right padding (confirmed as a real reported bug, text
   sat flush against the card edge) nor a contained position for the shared
   "v-messages__message" class's positioning to resolve against (Vuetify's
   base CSS expects that class inside a positioned ancestor - without
   one, this rendered many times taller than its actual text, leaving a
   huge blank gap before the toolbar below - also confirmed as a real
   reported bug). Now wrapped in a v-card-text with the shared
   .tab-intro-section class (see App.vue) like every other tab. */

/* Same toolbar treatment as the graphic editor toolbar: icon buttons in a
   row, with a bottom border and extra padding once the code has scrolled
   under it. The code area scrolls on its own, so the toolbar stays at the top
   of the tab. */
.generated-code-toolbar {
  flex: 0 0 auto;
  background-color: #fff;
  padding: 4px 16px;
  transition: padding 0.15s ease;
}

.generated-code-toolbar-scrolled {
  border-bottom: 1px solid rgba(0, 0, 0, 0.24);
  padding-top: 10px;
  padding-bottom: 10px;
}

.desaturate-app-colors .generated-code-toolbar {
  background-color: #e1e1e1;
}

.generated-code-toolbar-row {
  display: flex;
  align-items: center;
  gap: 4px;
  min-height: 28px;
}

.generated-code-toolbar-row >>> .data-icon-btn-size {
  margin: 0;
}

/* Icon states copied from the graphic editor toolbar: faint at rest, darker
   on hover, shrinking slightly while pressed. */
.generated-code-toolbar-row >>> .v-btn .v-icon {
  color: var(--editor-icon-rest-color, rgba(0, 0, 0, 0.38)) !important;
  transition: color 0.15s ease, transform 0.08s ease;
}

.generated-code-toolbar-row >>> .v-btn:not(.v-btn--disabled):hover .v-icon {
  color: rgba(0, 0, 0, 0.87) !important;
}

.generated-code-toolbar-row >>> .v-btn:not(.v-btn--disabled):active .v-icon {
  transform: scale(0.82);
}

/* The actual scrolling element now (see .editor-container's  comment) -
   takes up whatever space is left once the title/toolbar above and the
   search dock below (both flex: 0 0 auto, sized to their content) claim
   theirs. min-height: 0 overrides flexbox's default min-height: auto on
   a flex item, which would otherwise let this refuse to shrink smaller than
   its content and break scrolling entirely within a flex column - a real,
   well-known flexbox gotcha, not a hypothetical one. */
.code-scroll-wrapper {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
}

/* A genuine flex footer of .editor-container (see its  template comment
   for why this replaced "position: sticky; bottom: 0" - that overlaid the
   scrollable area instead of actually reserving its space, which made
   a match on one of the last few lines permanently unreachable no matter
   how the highlight's scroll target was computed). Left-aligned within
   its full-width row (justify-content, not float) so the search field
   itself sits at the dock's left edge, with the count/prev/next
   controls trailing right after it - not pushed to the row's right
   edge as a group. Plain white background (the standard v-card background
   every other field in this app sits on, e.g. Configuration.vue's
   fields) rather than matching the dark code area behind it - a dark
   background needed its bespoke light-text overrides for the field to
   stay readable, which fought the standard v-text-field styling instead of
   just using it. */
.generated-code-search-dock {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 0;
  padding: 6px 16px 6px 8px;
  background: #fff;
  border-top: 1px solid rgba(0, 0, 0, 0.12);
  /* Being the last child now (see .editor-container's  comment), this
     sits flush against the v-card's bottom edge - Vuetify's default
     card corner-rounding otherwise shows through as two rounded notches at
     this row's bottom corners, clipping its square white background into a
     rounded shape that doesn't match the rest of the row. */
  border-radius: 0;
}

/* No bespoke color/border/background overrides here - deliberately, to
   match how a compact toolbar-row field is already styled elsewhere in
   this app (e.g. DataEditor.vue's ".data-columns-field": dense,
   hide-details, plain Vuetify default underline styling, sized only via a
   fixed flex-basis). Just the width is capped (flex: 0 0, not flex: 1) -
   a search box stretching the full remaining row width looked oversized
   next to the small icon buttons beside it. */
.generated-code-search-field {
  flex: 0 0 260px;
  /* A dense v-text-field reserves space above its  input line for a
     floating label even with a plain placeholder (no floating label text
     ever actually shown here), which reads as sitting a little low against
     the row's other centered controls (count text, prev/next buttons) -
     nudges it up to compensate. Estimated, not measured - adjust if it's
     still off. */
  margin-top: -4px;
}

.generated-code-search-count {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.6);
  white-space: nowrap;
  padding: 0 4px;
}

/* Same flat-icon, fade-in-on-hover/blue-on-press treatment as the Music
   tab's play/stop buttons (MusicEditor.vue's .music-flat-icon-btn) -
   transparent background (no Vuetify default hover circle), icon fades
   from a faint grey to near-black on hover, and flashes the app's blue
   on an actual click/press. */
.generated-code-flat-icon-btn {
  background-color: transparent !important;
  box-shadow: none !important;
}

.generated-code-flat-icon-btn::before {
  display: none;
}

.generated-code-flat-icon-btn >>> .v-icon {
  color: rgba(0, 0, 0, 0.38) !important;
  transition: color 0.15s ease;
}

.generated-code-flat-icon-btn:hover >>> .v-icon {
  color: rgba(0, 0, 0, 0.87) !important;
}

.generated-code-flat-icon-btn:active >>> .v-icon {
  color: var(--v-primary-base, #1976d2) !important;
}

.code-scroll {
  display: flex;
  align-items: flex-start;
  /* NOT overflow: auto - .code-scroll-wrapper (the actual flex item sized
     to fill the pane down to the search dock) is the one, sole horizontal
     scroll owner. This element only ever grows as tall as its content
     (align-items: flex-start, no explicit height), so if IT were also a
     scroll container, its scrollbar would render right after the last
     line of code - wherever that happens to land - instead of pinned to
     the bottom of the visible pane just above the search dock, which is
     where a user actually expects to find it. Confirmed directly as a real
     bug this way (the scrollbar existed, but only showed up mid-pane,
     easy to miss entirely on a short file). */
}

/* Matches duotone-sea.css's  pre[class*="language-"] font/spacing exactly
   (font family/size/line-height/margin), so each printed number lines up
   with its row in the code pane next to it. */
.line-numbers-gutter {
  flex: none;
  position: sticky;
  left: 0;
  z-index: 1;
  margin: .5em 0;
  padding: 1em .75em 1em 1em;
  font-family: Hack, Consolas, Menlo, Monaco, 'Andale Mono WT', 'Andale Mono', 'Lucida Console',
    'Lucida Sans Typewriter', 'DejaVu Sans Mono', 'Bitstream Vera Sans Mono', 'Liberation Mono',
    'Nimbus Mono L', 'Courier New', Courier, monospace;
  font-size: 14px;
  line-height: 1.375;
  text-align: right;
  color: #4a5f78;
  background: #1d262f;
  border-right: 1px solid #2c3847;
  user-select: none;
}

.code-container {
  flex: 1 1 auto;
  /* min-width: 0 (flexbox's "allow shrinking below content size"
     override) was actively WRONG here, not just unhelpful: it's what a flex
     item needs when its overflowing content should be clipped/scrolled
     INTERNALLY, but this pane's scrolling happens on an ANCESTOR
     instead (.code-scroll-wrapper, so .line-numbers-gutter's
     "position: sticky; left: 0" - a sibling, not a descendant, of this pane -
     scrolls in lockstep with the code beside it). With min-width: 0, this
     flex item was letting itself (and the <pre> inside it) shrink down to
     fit the viewport no matter how long the widest generated line actually
     was, so .code-scroll-wrapper's overflow: auto never had any real
     overflow to scroll - confirmed directly as the reported bug (long lines
     just never triggered a horizontal scrollbar at all). min-width:
     max-content is the standard fix for exactly this flexbox gotcha: still
     grows to fill available width for the common case (an ordinary, narrow
     line), but refuses to shrink below the widest line's natural
     (unwrapped, thanks to the theme's "white-space: pre") width once that
     exceeds the viewport, which is what actually makes .code-scroll-wrapper
     overflow and show its scrollbar. */
  min-width: max-content;
}

/* duotone-sea.css's base "code[class*='language-']" rule (meant for an
   inline <code> snippet OUTSIDE a <pre>, where a faint tint helps it read
   as code against surrounding prose) sets background-color: rgba(0, 0, 0,
   .05) - harmless there, but a real reported bug here: this <code> is
   display: inline (never overridden), so that tint only wraps tightly
   around each line's actual text instead of spanning the full pane width,
   reading as every line having a slightly different background color
   against .code-container's real rgb(29, 38, 47) behind it. Removed
   outright - this pane's lines were never meant to have a background at
   all. >>> pierces vue-code-highlight's rendered <code>, which never
   carries this component's scope attribute. */
.code-container >>> code {
  background: none;
}

</style>
<!-- Styles the CSS Custom Highlight this component sets via
     CSS.highlights.set() in selectMatch() (see its comment for why
     this replaced window.getSelection() - a focus/highlight conflict with
     the search field that Selection couldn't avoid). A plain, unscoped
     <style> block, not "scoped" like the one above - Vue's scoped CSS
     can't target ::highlight(), since it's a pseudo-element with no real
     DOM node to attach the scoping data-attribute to. Named specifically
     enough (matching SEARCH_HIGHLIGHT_NAME exactly) to be extremely
     unlikely to collide with any other component's highlight, if this
     app ever adds another one. -->
<style>
::highlight(generated-code-search-match) {
  background-color: #ffd54f;
  color: #1d262f;
}
</style>
