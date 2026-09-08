import { render } from "@testing-library/react";
import Loading from "@/app/loading";

describe("Root loading", () => {
  it("does not replace the landing with a list skeleton", () => {
    const { container } = render(<Loading />);
    expect(container).toBeEmptyDOMElement();
  });
});
