{{- define "ayvana.image" -}}
{{ .root.Values.image.registry }}/{{ .root.Values.image.repository }}/{{ .app.name }}:{{ .root.Values.image.tag }}
{{- end -}}
