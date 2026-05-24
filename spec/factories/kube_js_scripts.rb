# frozen_string_literal: true

FactoryBot.define do
  factory :kube_js_script do
    association :generated_modpack
    mod_pair       { "mod_a_id:mod_b_id" }
    script_content { "// KubeJS integration script\nconsole.log('loaded');" }
    script_type    { "integration" }
  end
end
