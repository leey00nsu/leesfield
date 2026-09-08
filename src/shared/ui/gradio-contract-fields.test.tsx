import userEvent from "@testing-library/user-event";

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { GradioContractFields } from "./gradio-contract-fields";
import type { GradioContract } from "@/shared/model-catalog/gradio-contract";
vi.mock("next-intl", () => ({
  useLocale: () => "ko",
  useTranslations: () => (key: string) => key,
}));
const contract: GradioContract = {
  version: 1,
  apiName: "/generate",
  inputs: [
    {
      name: "duration",
      label: "Duration",
      schema: { type: "number" },
      kind: "number",
      required: false,
      nullable: false,
      default: 5,
    },
    {
      name: "frame",
      label: "First Frame",
      schema: {},
      kind: "file",
      required: true,
      nullable: true,
    },
  ],
  output: { media: "video", path: [0], multiple: false },
  diagnostics: [],
  reviewed: true,
};
describe("Gradio contract fields", () => {
  it("모델 고유 필드를 표시하고 원본 이름으로 값을 변경한다", () => {
    const onChange = vi.fn();
    render(
      <GradioContractFields
        contract={contract}
        values={{ frame: null }}
        prompt="demo"
        onChange={onChange}
      />,
    );
    expect(screen.getByLabelText("Duration")).toHaveValue(5);
    fireEvent.change(screen.getByLabelText("Duration"), {
      target: { value: "7" },
    });
    expect(onChange).toHaveBeenCalledWith({ frame: null, duration: 7 });
    expect(screen.queryByText("값 없음 (null)")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", {name:"제거"})).not.toBeInTheDocument();
  });
});

it("labels required inputs and explains missing values without internal codes", () => {
  render(
    <GradioContractFields
      contract={contract}
      values={{}}
      prompt="demo"
      onChange={vi.fn()}
    />,
  );
  expect(screen.getByLabelText("First Frame")).toHaveAttribute(
    "aria-required",
    "true",
  );
  expect(screen.getByText("필수")).toBeVisible();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "First Frame: 필수 입력입니다.",
  );
  expect(screen.getByRole("alert")).not.toHaveTextContent("HF_CONTRACT");
});

it("uses a shared select and preserves numeric option types", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  const choices = {
    ...contract,
    inputs: [
      {
        name: "quality",
        label: "Quality",
        schema: { type: "number" },
        kind: "number" as const,
        required: true,
        nullable: false,
        choices: [0, 2],
        default: 0,
      },
    ],
  };
  const { container } = render(
    <GradioContractFields
      contract={choices}
      values={{}}
      prompt="demo"
      onChange={onChange}
    />,
  );
  expect(container.querySelector("select:not([aria-hidden])")).toBeNull();
  const select = screen.getByRole("combobox", { name: "Quality" });
  await user.click(select);
  await user.click(await screen.findByRole("option", { name: "2" }));
  expect(onChange).toHaveBeenCalledWith({ quality: 2 });
});

it("does not show prompt errors in options, but still shows invalid options",()=>{
const mapped={...contract,inputs:[{name:"text",label:"Text to Synthesize",schema:{type:"string"},kind:"string" as const,canonical:"prompt" as const,required:false,nullable:false},...contract.inputs]};
const {rerender}=render(<GradioContractFields contract={mapped} values={{frame:null}} prompt="" onChange={vi.fn()}/>);
expect(screen.queryByRole("alert")).toBeNull();
rerender(<GradioContractFields contract={mapped} values={{}} prompt="" onChange={vi.fn()}/>);
expect(screen.getByRole("alert")).toHaveTextContent("First Frame");
expect(screen.getByRole("alert")).not.toHaveTextContent("Text to Synthesize");
});

it("파일 첨부 후에만 삭제를 제공하며 nullable 파일 삭제는 null을 전달한다", async () => {
 const onChange=vi.fn(); const user=userEvent.setup();
 const {rerender}=render(<GradioContractFields contract={contract} values={{frame:null}} prompt="demo" onChange={onChange}/>);
 await user.upload(screen.getByLabelText("First Frame"),new File(["image"],"frame.png",{type:"image/png"}));
 expect(onChange).toHaveBeenCalledWith({frame:expect.stringMatching(/^data:image/)});
 rerender(<GradioContractFields contract={contract} values={{frame:"data:image/png;base64,aW1hZ2U="}} prompt="demo" onChange={onChange}/>);
 expect(screen.getByRole("img",{name:"First Frame"})).toBeVisible();
 await user.click(screen.getByRole("button",{name:"제거"}));
 expect(onChange).toHaveBeenLastCalledWith({frame:null});
});
