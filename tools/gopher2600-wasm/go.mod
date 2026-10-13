module vcsgm/gopher2600-wasm

go 1.27.0

require github.com/jetsetilly/gopher2600 v0.57.2

require (
	github.com/go-audio/audio v1.0.0 // indirect
	github.com/go-audio/riff v1.0.0 // indirect
	github.com/go-audio/wav v1.1.0 // indirect
	github.com/hajimehoshi/go-mp3 v0.3.4 // indirect
	github.com/jetsetilly/supercharge v0.3.0 // indirect
)

// This replace directive's target only ever existed on the machine that
// generated vendor/ (a throwaway shallow clone of gopher2600's full repo,
// ~1.3GB due to embedded test-fixture assets, deliberately not vendored into
// this project). It is NEVER read from in normal use: with -mod=vendor (this
// module's default - see vendor/modules.txt), Go builds entirely from the
// vendor/ directory and only checks this line's TEXT against
// vendor/modules.txt for consistency, never touching the path on disk. Only
// someone intentionally re-running `go mod vendor` to pick up a gopher2600
// update needs this path to actually exist (re-create it with:
// git clone --depth 1 https://github.com/jetsetilly/gopher2600.git <path>
// and point this at it first).
replace github.com/jetsetilly/gopher2600 => C:\tmp\gopher2600-vendor-src
